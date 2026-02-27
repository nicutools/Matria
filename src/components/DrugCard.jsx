import { useState, useRef, useEffect } from 'react';
import { fetchPregnancy } from '../api/pregnancy';
import ShareButton from './ShareButton';

function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const SECTIONS = [
  { key: 'clinicalConsiderations', label: 'Clinical Considerations' },
  { key: 'data', label: 'Data (Human & Animal)' },
  { key: 'pregnancyRegistry', label: 'Pregnancy Exposure Registry' },
];

export default function DrugCard({ drug }) {
  const [pregnancy, setPregnancy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const abortRef = useRef(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function ensurePregnancy() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchPregnancy(drug.title, controller.signal);
      setPregnancy(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        fetchedRef.current = false;
        setError('Unable to load pregnancy details.');
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(key) {
    setOpenSections((prev) => (prev[key] ? {} : { [key]: true }));
    ensurePregnancy();
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-sky-900 dark:text-slate-100">
          {drug.title}
        </h2>
        {drug.effectiveTime && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {formatDate(drug.effectiveTime)}
          </span>
        )}
      </div>

      {pregnancy?.riskSummary && (
        <div className="mt-3 rounded-2xl bg-teal-50 p-4 dark:bg-teal-900/20">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Risk Summary
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {pregnancy.riskSummary}
          </p>
        </div>
      )}

      {!pregnancy && !loading && !error && (
        <button
          onClick={ensurePregnancy}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-teal-600 active:bg-slate-50 dark:border-slate-800 dark:text-teal-400 dark:active:bg-slate-800"
        >
          Show pregnancy details
        </button>
      )}

      {loading && !pregnancy && (
        <p className="mt-3 py-2 text-center text-sm text-slate-400 dark:text-slate-500">Loading pregnancy data...</p>
      )}

      {error && !pregnancy && (
        <p className="mt-3 py-2 text-center text-sm text-red-500 dark:text-red-400">{error}</p>
      )}

      {pregnancy && !pregnancy.riskSummary && !pregnancy.clinicalConsiderations && !pregnancy.data && !pregnancy.pregnancyRegistry && (
        <p className="mt-3 py-2 text-sm text-slate-400 dark:text-slate-500">
          No pregnancy labeling data available for this drug.
        </p>
      )}

      {pregnancy && (pregnancy.clinicalConsiderations || pregnancy.data || pregnancy.pregnancyRegistry) && (
        <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {SECTIONS.map(({ key, label }) => {
            const isOpen = openSections[key];
            const content = pregnancy?.[key];
            const hasNoContent = pregnancy && !content;

            return (
              <div key={key}>
                <button
                  onClick={() => toggleSection(key)}
                  className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700 active:bg-slate-50 dark:text-slate-300 dark:active:bg-slate-800"
                >
                  {label}
                  <svg
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3">
                    {content && (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        {content}
                      </p>
                    )}
                    {hasNoContent && (
                      <p className="py-2 text-sm text-slate-400 dark:text-slate-500">No data available.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <ShareButton drugTitle={drug.title} />
      </div>
    </article>
  );
}
