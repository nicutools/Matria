import tgaData from '../data/tgaPregnancy.json';

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
 *
 * @param {string} drugName — generic drug name (any case)
 * @returns {{ category: string, statement?: string } | null}
 */
export function lookupTGA(drugName) {
  if (!drugName) return null;

  const key = drugName.trim().toLowerCase();
  const entry = tgaData.data[key];
  if (entry) return entry;

  // Try US→AU name mapping
  const auName = US_TO_AU[key];
  if (auName) return tgaData.data[auName] || null;

  return null;
}
