const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const drugName = url.searchParams.get('drug_name');

  if (!drugName || !drugName.trim()) {
    return Response.json(
      { error: 'Missing drug_name parameter.' },
      { status: 400 },
    );
  }

  const query = drugName.trim();

  // Search OpenFDA by generic_name OR brand_name
  // OpenFDA uses + for AND — we must NOT encode it
  const q = encodeURIComponent(query);
  const searchTerm = query.includes(' ')
    ? `(openfda.generic_name:"${q}"+openfda.brand_name:"${q}")`
    : `(openfda.generic_name:${q}+openfda.brand_name:${q})`;

  const fdaUrl = `${OPENFDA_BASE}?search=${searchTerm}&limit=100`;

  let fdaRes;
  try {
    fdaRes = await fetch(fdaUrl);
  } catch {
    return Response.json(
      { error: 'Failed to reach OpenFDA.' },
      { status: 502 },
    );
  }

  // OpenFDA returns 404 for zero results
  if (fdaRes.status === 404) {
    return Response.json({ results: [] }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }

  if (!fdaRes.ok) {
    return Response.json(
      { error: `OpenFDA returned status ${fdaRes.status}.` },
      { status: 502 },
    );
  }

  const data = await fdaRes.json();
  const labels = data.results || [];

  // Filter: only keep labels where the generic_name IS the searched drug
  // (exact match after stripping salt forms). This removes combo products
  // like "Acetaminophen and Codeine" when searching for "Acetaminophen".
  const queryUpper = stripSaltForm(query).toUpperCase();
  const exactMatch = labels.filter((label) => {
    const openfda = label.openfda || {};
    const genericName = stripSaltForm((openfda.generic_name || [])[0] || '').toUpperCase();
    return genericName === queryUpper;
  });

  // If no exact match, try prefix match on generic_name or brand_name
  const prefixMatch = exactMatch.length > 0 ? exactMatch : labels.filter((label) => {
    const openfda = label.openfda || {};
    const genericName = stripSaltForm((openfda.generic_name || [])[0] || '').toUpperCase();
    const brandName = stripSaltForm((openfda.brand_name || [])[0] || '').toUpperCase();
    return genericName.startsWith(queryUpper) || brandName.startsWith(queryUpper);
  });

  // Fall back to unfiltered if filtering removed everything
  const pool = prefixMatch.length > 0 ? prefixMatch : labels;

  // Deduplicate by generic_name (stripped of salt forms),
  // preferring labels that have pregnancy data, then most recent
  const groups = new Map();

  for (const label of pool) {
    const openfda = label.openfda || {};
    const genericNames = openfda.generic_name || [];
    const brandNames = openfda.brand_name || [];

    const genericName = genericNames[0] || brandNames[0] || '';
    if (!genericName) continue;

    const key = stripSaltForm(genericName).toUpperCase();
    const hasPregnancy = !!(label.pregnancy && label.pregnancy.length > 0);
    const hasTeratogenic = !!(label.teratogenic_effects && label.teratogenic_effects.length > 0);
    const hasPregBreastfeed = !!(label.pregnancy_or_breast_feeding && label.pregnancy_or_breast_feeding.length > 0);
    const hasData = hasPregnancy || hasTeratogenic || hasPregBreastfeed;

    const existing = groups.get(key);
    if (!existing || (hasData && !existing.hasData) ||
        (hasData === existing.hasData && (label.effective_time || '') > (existing.effectiveTime || ''))) {
      const mergedBrands = existing ? [...existing.brandNames, ...brandNames] : brandNames;
      groups.set(key, {
        genericName,
        brandNames: [...new Set(mergedBrands.map(b => b.trim()).filter(Boolean))],
        effectiveTime: label.effective_time || null,
        hasData,
      });
    } else if (existing) {
      for (const b of brandNames) {
        if (b.trim()) existing.brandNames.push(b.trim());
      }
      existing.brandNames = [...new Set(existing.brandNames)];
    }
  }

  const results = Array.from(groups.values()).map((g) => {
    // Clean up brand names: strip salt forms, dedup, exclude names that match the generic
    const displayTitle = toTitleCase(stripSaltForm(g.genericName));
    const cleanBrands = [...new Set(
      g.brandNames
        .map(b => toTitleCase(stripSaltForm(b)))
        .filter(b => b.toLowerCase() !== displayTitle.toLowerCase())
    )];

    return {
      title: displayTitle,
      brandNames: cleanBrands,
      effectiveTime: g.effectiveTime,
      hasPregnancyData: g.hasData,
    };
  });

  results.sort((a, b) => a.title.localeCompare(b.title));

  return Response.json({ results }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}

function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

// Strip common salt forms from generic/brand name for dedup and display
const SALT_RE = /\b(HYDROCHLORIDE|HYDROCHORIDE|HCL|SULFATE|SODIUM|POTASSIUM|MESYLATE|MALEATE|FUMARATE|TARTRATE|BESYLATE|SUCCINATE|CITRATE|ACETATE|PHOSPHATE|BROMIDE|CHLORIDE|NITRATE|CALCIUM|MAGNESIUM|BITARTRATE)\b/gi;

function stripSaltForm(name) {
  return name
    .replace(SALT_RE, '')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,|,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
