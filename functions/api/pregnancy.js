const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const name = url.searchParams.get('name');

  if (!name || !name.trim()) {
    return Response.json(
      { error: 'Missing name parameter.' },
      { status: 400 },
    );
  }

  // Search for this drug and find the label with pregnancy data
  const q = encodeURIComponent(name.trim());
  const fdaUrl = `${OPENFDA_BASE}?search=openfda.generic_name:"${q}"&limit=20`;

  let fdaRes;
  try {
    fdaRes = await fetch(fdaUrl);
  } catch {
    return Response.json(
      { error: 'Failed to reach OpenFDA.' },
      { status: 502 },
    );
  }

  if (fdaRes.status === 404) {
    return Response.json(emptyResult(), {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  if (!fdaRes.ok) {
    return Response.json(
      { error: `OpenFDA returned status ${fdaRes.status}.` },
      { status: 502 },
    );
  }

  const data = await fdaRes.json();
  const allLabels = data.results || [];

  // Filter to only labels where generic_name exactly matches the query
  // (OpenFDA phrase search can still return combos)
  const queryUpper = stripSalt(name.trim());
  const labels = allLabels.filter((label) => {
    const gn = stripSalt((label.openfda?.generic_name || [])[0] || '');
    return gn.toUpperCase() === queryUpper.toUpperCase();
  });

  // Fall back to all results if exact matching removed everything
  const pool = labels.length > 0 ? labels : allLabels;

  // Find the best label: prefer one with `pregnancy` field (new PLLR format),
  // then `teratogenic_effects` (old format), then `pregnancy_or_breast_feeding` (OTC)
  let bestLabel = null;
  let bestScore = 0;

  for (const label of pool) {
    let score = 0;
    if (label.pregnancy && label.pregnancy.length > 0) score = 3;
    else if (label.teratogenic_effects && label.teratogenic_effects.length > 0) score = 2;
    else if (label.pregnancy_or_breast_feeding && label.pregnancy_or_breast_feeding.length > 0) score = 1;

    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  if (!bestLabel || bestScore === 0) {
    return Response.json(emptyResult(), {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  let result;

  if (bestScore === 3) {
    // New PLLR format — pregnancy field contains full Section 8.1
    const rawText = cleanHtml(bestLabel.pregnancy.join('\n\n'));
    result = splitSubsections(rawText);
  } else if (bestScore === 2) {
    // Old format — teratogenic_effects with pregnancy category
    const rawText = cleanHtml(bestLabel.teratogenic_effects.join('\n\n'));
    result = {
      riskSummary: rawText,
      clinicalConsiderations: null,
      data: null,
      pregnancyRegistry: null,
      format: 'legacy',
    };
  } else {
    // OTC — brief warning
    const rawText = cleanHtml(bestLabel.pregnancy_or_breast_feeding.join('\n\n'));
    result = {
      riskSummary: rawText,
      clinicalConsiderations: null,
      data: null,
      pregnancyRegistry: null,
      format: 'otc',
    };
  }

  return Response.json(result, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}

const SALT_RE = /\b(HYDROCHLORIDE|HYDROCHORIDE|HCL|SULFATE|SODIUM|POTASSIUM|MESYLATE|MALEATE|FUMARATE|TARTRATE|BESYLATE|SUCCINATE|CITRATE|ACETATE|PHOSPHATE|BROMIDE|CHLORIDE|NITRATE|CALCIUM|MAGNESIUM|BITARTRATE)\b/gi;

function stripSalt(name) {
  return name.replace(SALT_RE, '').replace(/\s{2,}/g, ' ').trim();
}

function emptyResult() {
  return {
    riskSummary: null,
    clinicalConsiderations: null,
    data: null,
    pregnancyRegistry: null,
  };
}

function cleanHtml(text) {
  // Convert block-level HTML elements to newlines before stripping tags
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')          // collapse spaces within lines, preserve newlines
    .replace(/\n{3,}/g, '\n\n')       // max one blank line between paragraphs
    .split('\n').map(l => l.trim()).join('\n')  // trim each line
    .trim();
}

// Known PLLR sub-headings that appear inline without line breaks.
// Insert \n\n before them so FormattedText can render them as bold headings.
const SUB_HEADINGS = [
  /Human Data/,
  /Animal Data/,
  /Third Trimester Exposure/,
  /First Trimester Exposure/,
  /Disease-[Aa]ssociated [Mm]aternal and\/or [Ee]mbryo\/[Ff]etal [Rr]isk/,
  /Maternal Adverse Reactions/,
  /Fetal\/Neonatal [Aa]dverse [Rr]eactions/,
  /Labor or Delivery/,
];

function insertSubHeadings(text) {
  let result = text;
  for (const re of SUB_HEADINGS) {
    // Only insert newline if the heading isn't already at the start of a line
    result = result.replace(new RegExp(`(?<!^)(?<!\\n)(${re.source})`, 'g'), '\n\n$1');
  }
  return result.trim();
}

function splitSubsections(fullText) {
  // Strip the leading "8.1 Pregnancy" header if present
  let cleaned = fullText.replace(/^\s*8\.1\s+Pregnancy\s*/i, '').trim();

  // Remove cross-references like [See Data], [see Clinical Considerations],
  // [see Warnings and Precautions (5.3) and Clinical Considerations], etc.
  // These appear inline in body text and would otherwise be mistaken for
  // actual section headings during splitting.
  cleaned = cleaned
    .replace(/\[\s*[Ss]ee\s+[^\]]*\]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();

  // Patterns omit the i flag because actual PLLR headings are title-cased,
  // while body text mentions (e.g. "based on data from", "clinical
  // considerations regarding") are lowercase and must not trigger a split.
  const headings = [
    { key: 'pregnancyRegistry', pattern: /Pregnancy\s+Exposure\s+Registry/ },
    { key: 'riskSummary', pattern: /Risk\s+Summary/ },
    { key: 'clinicalConsiderations', pattern: /Clinical\s+Considerations/ },
    { key: 'data', pattern: /\bData\b/ },
  ];

  const positions = [];
  for (const { key, pattern } of headings) {
    const match = cleaned.match(pattern);
    if (match) {
      positions.push({ key, index: match.index, length: match[0].length });
    }
  }

  if (positions.length === 0) {
    return {
      riskSummary: cleaned,
      clinicalConsiderations: null,
      data: null,
      pregnancyRegistry: null,
    };
  }

  positions.sort((a, b) => a.index - b.index);

  const result = {
    riskSummary: null,
    clinicalConsiderations: null,
    data: null,
    pregnancyRegistry: null,
  };

  // Text before first heading → riskSummary if no explicit Risk Summary heading
  const firstPos = positions[0];
  const textBefore = cleaned.slice(0, firstPos.index).trim();
  if (textBefore && !positions.some((p) => p.key === 'riskSummary')) {
    result.riskSummary = textBefore;
  }

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const next = positions[i + 1];
    const start = current.index + current.length;
    const end = next ? next.index : cleaned.length;
    const content = cleaned.slice(start, end).trim();
    if (content) {
      result[current.key] = insertSubHeadings(content);
    }
  }

  return result;
}
