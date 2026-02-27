const POPULAR_DRUGS = [
  'Paracetamol',
  'Sertraline',
  'Levothyroxine',
  'Ondansetron',
  'Metformin',
  'Azithromycin',
  'Amoxicillin',
  'Ibuprofen',
];

export default function HomePage({ onDrugSelect }) {
  return (
    <div className="py-8">
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-sky-900 dark:text-slate-100">
          Evidence-based medication safety in pregnancy
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Search any drug or brand name for pregnancy safety information from the Australian TGA and FDA.
        </p>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Common searches
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {POPULAR_DRUGS.map((name) => (
            <button
              key={name}
              onClick={() => onDrugSelect(name)}
              className="min-h-11 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:shadow-none dark:ring-slate-700 dark:active:bg-slate-800"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold tracking-tight text-sky-900 dark:text-slate-100">About Matria</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Matria helps parents and healthcare providers quickly look up pregnancy safety information for medications. Data comes from the{' '}
          <a
            href="https://www.tga.gov.au/resources/publication/publications/prescribing-medicines-pregnancy-database"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 underline hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          >
            Australian TGA
          </a>
          {' '}(pregnancy categories and safety statements) and the{' '}
          <a
            href="https://open.fda.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 underline hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          >
            US FDA (OpenFDA)
          </a>
          {' '}(detailed pregnancy labeling).
        </p>
      </div>
    </div>
  );
}
