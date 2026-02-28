import data from '../data/brandToGeneric.json';

const mappings = data.mappings;
const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

/**
 * Synchronous brand resolution — local mappings only (no RxNorm).
 * Used by TGA-primary search path where we need instant results.
 */
export function resolveLocalBrand(query) {
  const trimmed = query.trim();
  const key = trimmed.toLowerCase();
  const localGeneric = mappings[key];
  if (localGeneric) {
    return { resolved: true, type: 'brand', generic: localGeneric, original: trimmed };
  }
  return null;
}

export async function resolveBrand(query, signal) {
  const trimmed = query.trim();
  const key = trimmed.toLowerCase();

  // 1. Try local brand-to-generic mapping first (instant, no network)
  const localGeneric = mappings[key];
  if (localGeneric) {
    return { resolved: true, type: 'brand', generic: localGeneric, original: trimmed };
  }

  // 2. Try RxNorm for international generic names (e.g. paracetamol → acetaminophen)
  try {
    const cuiRes = await fetch(`${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(trimmed)}`, { signal });
    if (cuiRes.ok) {
      const cuiData = await cuiRes.json();
      const rxcui = cuiData.idGroup?.rxnormId?.[0];
      if (rxcui) {
        const propRes = await fetch(`${RXNORM_BASE}/rxcui/${rxcui}/properties.json`, { signal });
        if (propRes.ok) {
          const propData = await propRes.json();
          const usName = propData.properties?.name;
          if (usName && usName.toLowerCase() !== key &&
              !usName.toLowerCase().startsWith(key)) {
            return { resolved: true, type: 'international', generic: usName, original: trimmed };
          }
        }
      }
    }
  } catch {
    // RxNorm unavailable — fall through silently
  }

  // 3. No mapping found — use input as-is
  return { resolved: false, type: null, generic: trimmed, original: null };
}
