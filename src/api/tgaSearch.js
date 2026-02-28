import tgaData from '../data/tgaPregnancy.json';
import brandData from '../data/brandToGeneric.json';

export const TGA_UPDATED = tgaData._meta.updated;

/**
 * US generic names that differ from the INN/AU names used by the TGA.
 */
const US_TO_AU = {
  acetaminophen: 'paracetamol',
  albuterol: 'salbutamol',
  meperidine: 'pethidine',
  nitroglycerin: 'glyceryl trinitrate',
  epinephrine: 'adrenaline',
  norepinephrine: 'noradrenaline',
  cyclosporine: 'ciclosporin',
  sulfamethoxazole: 'sulphamethoxazole',
  busulfan: 'busulphan',
  phenobarbital: 'phenobarbitone',
};

/** Reverse map: AU/INN → US (for FDA API calls) */
const AU_TO_US = Object.fromEntries(
  Object.entries(US_TO_AU).map(([us, au]) => [au, us])
);

/** Reverse brand lookup: generic (lowercase) → brand names */
const genericToBrands = {};
for (const [brand, generic] of Object.entries(brandData.mappings)) {
  const g = generic.toLowerCase();
  if (!genericToBrands[g]) genericToBrands[g] = [];
  genericToBrands[g].push(brand);
}

function toTitleCase(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function lookupBrands(tgaName) {
  // Check brands under TGA name and also US equivalent
  const brands = genericToBrands[tgaName] || [];
  const usName = AU_TO_US[tgaName];
  if (usName) {
    const usBrands = genericToBrands[usName] || [];
    return [...new Set([...brands, ...usBrands])].map(toTitleCase);
  }
  return brands.map(toTitleCase);
}

/**
 * Search TGA pregnancy data locally. Instant, no network.
 *
 * @param {string} query — drug name (any case), may be brand or generic
 * @returns {Array<{ title, tgaName, category, statement?, brandNames, fdaName?, source }>}
 */
export function searchTGA(query) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 3) return [];

  const key = trimmed.toLowerCase();

  // 1. Resolve brand → generic (local only)
  const generic = brandData.mappings[key];
  const resolvedKey = generic ? generic.toLowerCase() : key;

  // 2. Apply US→AU name mapping
  const auKey = US_TO_AU[resolvedKey] || resolvedKey;

  // 3. Exact match
  const exact = tgaData.data[auKey];
  if (exact) return [makeResult(auKey)];

  // 4. Prefix match (drug families: "insulin" → "insulin aspart", etc.)
  //    and startsWith match (partial typing: "sertra" → "sertraline")
  const prefixMatches = []; // "insulin " prefix (formulations)
  const startsWithMatches = []; // "sertra" prefix (partial names)

  for (const name of Object.keys(tgaData.data)) {
    if (name.startsWith(auKey + ' ')) {
      prefixMatches.push(name);
    } else if (name.startsWith(auKey)) {
      startsWithMatches.push(name);
    }
  }

  if (prefixMatches.length > 0) {
    return prefixMatches.sort().map(makeResult);
  }
  if (startsWithMatches.length > 0) {
    return startsWithMatches.sort().map(makeResult);
  }

  return [];
}

function makeResult(tgaName) {
  const data = tgaData.data[tgaName];
  const usName = AU_TO_US[tgaName];
  return {
    title: toTitleCase(tgaName),
    tgaName,
    category: data.category,
    statement: data.statement || null,
    brandNames: lookupBrands(tgaName),
    fdaName: usName || null,
    source: 'tga',
  };
}
