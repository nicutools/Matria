import tgaData from '../data/tgaPregnancy.json';

export const TGA_UPDATED = tgaData._meta.updated;

/**
 * US generic names that differ from the INN/AU names used in the TGA database.
 * Only needed for the small minority of drugs where the US name diverges.
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

/**
 * Look up TGA pregnancy category for a drug name.
 * Tries the name as-is first (lowercase), then checks the US→AU reverse map.
 * Falls back to prefix matching for drug families (e.g. "insulin" matches
 * "insulin aspart", "insulin glargine", etc.).
 *
 * @param {string} drugName — generic drug name (any case)
 * @returns {{ type: 'exact', category: string, statement?: string }
 *         | { type: 'prefix', query: string, matches: Array<{name: string, category: string, statement?: string}> }
 *         | null}
 */
export function lookupTGA(drugName) {
  if (!drugName) return null;

  const key = drugName.trim().toLowerCase();

  // Exact match
  const entry = tgaData.data[key];
  if (entry) return { type: 'exact', ...entry };

  // Try US→AU name mapping (exact)
  const auName = US_TO_AU[key];
  if (auName) {
    const auEntry = tgaData.data[auName];
    if (auEntry) return { type: 'exact', ...auEntry };
  }

  // Prefix match fallback — find all formulations starting with the drug name
  const searchKey = auName || key;
  const prefix = searchKey + ' ';
  const matches = [];
  for (const [name, data] of Object.entries(tgaData.data)) {
    if (name.startsWith(prefix)) {
      matches.push({ name, ...data });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => a.name.localeCompare(b.name));
    return { type: 'prefix', query: searchKey, matches };
  }

  return null;
}
