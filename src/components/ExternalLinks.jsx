import bumpsLinks from '../data/bumpsLinks.json';
import motherToBabyLinks from '../data/motherToBabyLinks.json';

/**
 * US→AU name mapping for BUMPS links (BUMPS uses INN/AU names).
 */
const US_TO_INN = {
  acetaminophen: 'paracetamol',
  albuterol: 'salbutamol',
  meperidine: 'pethidine',
  epinephrine: 'adrenaline',
  norepinephrine: 'noradrenaline',
};

const bumpsSet = new Set(bumpsLinks);

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-6 0l7.5-7.5m0 0H15m4.5 0V7.5" />
    </svg>
  );
}

export default function ExternalLinks({ drugName }) {
  if (!drugName) return null;

  const key = drugName.trim().toLowerCase();

  // BUMPS uses INN/AU names — check against verified slugs
  const bumpsName = US_TO_INN[key] || key;
  const bumpsSlug = bumpsName.replace(/\s+/g, '-');
  const hasBumps = bumpsSet.has(bumpsSlug);
  const bumpsUrl = hasBumps
    ? `https://www.medicinesinpregnancy.org/leaflets-a-z/${bumpsSlug}/`
    : null;

  // MotherToBaby slugs often have suffixes like -pregnancy or brand names
  // Match by exact slug or slug followed by a hyphen separator
  const mtbDrugSlug = key.replace(/\s+/g, '-');
  const mtbSlug = motherToBabyLinks.find(
    (s) => s === mtbDrugSlug || s.startsWith(mtbDrugSlug + '-')
  );
  const mtbUrl = mtbSlug
    ? `https://mothertobaby.org/fact-sheets/${mtbSlug}/`
    : null;

  if (!bumpsUrl && !mtbUrl) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Patient Information Leaflets
      </h3>
      <div className="mt-2 flex flex-col gap-2">
        {bumpsUrl && (
          <a
            href={bumpsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-teal-600 active:bg-slate-100 dark:bg-slate-800 dark:text-teal-400 dark:active:bg-slate-700"
          >
            <ExternalLinkIcon />
            <span>BUMPS (UK) — Medicines in Pregnancy</span>
          </a>
        )}
        {mtbUrl && (
          <a
            href={mtbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-teal-600 active:bg-slate-100 dark:bg-slate-800 dark:text-teal-400 dark:active:bg-slate-700"
          >
            <ExternalLinkIcon />
            <span>MotherToBaby (US) — Fact Sheet</span>
          </a>
        )}
      </div>
    </div>
  );
}
