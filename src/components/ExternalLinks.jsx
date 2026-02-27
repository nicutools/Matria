/**
 * MotherToBaby slugs are unpredictable, so we maintain a small static map
 * of common drugs to their known fact-sheet URLs.
 */
const MOTHER_TO_BABY_SLUGS = {
  acetaminophen: 'acetaminophen',
  paracetamol: 'acetaminophen',
  acyclovir: 'acyclovir',
  adalimumab: 'adalimumab',
  albuterol: 'albuterol',
  amoxicillin: 'amoxicillin',
  aripiprazole: 'aripiprazole',
  aspirin: 'aspirin',
  atomoxetine: 'atomoxetine',
  azathioprine: 'azathioprine',
  azithromycin: 'azithromycin',
  buprenorphine: 'buprenorphine',
  bupropion: 'bupropion',
  carbamazepine: 'carbamazepine',
  cetirizine: 'cetirizine',
  citalopram: 'citalopram',
  clonazepam: 'clonazepam',
  codeine: 'codeine',
  doxycycline: 'doxycycline',
  duloxetine: 'duloxetine',
  escitalopram: 'escitalopram',
  fluconazole: 'fluconazole',
  fluoxetine: 'fluoxetine',
  gabapentin: 'gabapentin',
  hydroxychloroquine: 'hydroxychloroquine',
  ibuprofen: 'ibuprofen',
  infliximab: 'infliximab',
  isotretinoin: 'isotretinoin',
  lamotrigine: 'lamotrigine',
  levetiracetam: 'levetiracetam',
  levothyroxine: 'levothyroxine',
  lisinopril: 'lisinopril',
  lithium: 'lithium',
  lorazepam: 'lorazepam',
  metformin: 'metformin',
  methadone: 'methadone',
  methotrexate: 'methotrexate',
  methylphenidate: 'methylphenidate',
  metoprolol: 'metoprolol',
  montelukast: 'montelukast',
  naproxen: 'naproxen',
  nifedipine: 'nifedipine',
  olanzapine: 'olanzapine',
  omeprazole: 'omeprazole',
  ondansetron: 'ondansetron',
  oxycodone: 'oxycodone',
  paroxetine: 'paroxetine',
  prednisone: 'prednisone',
  pregabalin: 'pregabalin',
  quetiapine: 'quetiapine',
  sertraline: 'sertraline',
  sumatriptan: 'sumatriptan',
  topiramate: 'topiramate',
  tramadol: 'tramadol',
  'valproic acid': 'valproic-acid',
  venlafaxine: 'venlafaxine',
  warfarin: 'warfarin',
  zolpidem: 'zolpidem',
};

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

  // BUMPS uses INN/AU names
  const bumpsName = US_TO_INN[key] || key;
  const bumpsSlug = bumpsName.replace(/\s+/g, '-');
  const bumpsUrl = `https://www.medicinesinpregnancy.org/leaflets-a-z/${bumpsSlug}/`;

  // MotherToBaby uses its own slug scheme
  const mtbSlug = MOTHER_TO_BABY_SLUGS[key];
  const mtbUrl = mtbSlug
    ? `https://mothertobaby.org/fact-sheets/${mtbSlug}/`
    : null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Patient Information Leaflets
      </h3>
      <div className="mt-2 flex flex-col gap-2">
        <a
          href={bumpsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-teal-600 active:bg-slate-100 dark:bg-slate-800 dark:text-teal-400 dark:active:bg-slate-700"
        >
          <ExternalLinkIcon />
          <span>BUMPS (UK) — Medicines in Pregnancy</span>
        </a>
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
