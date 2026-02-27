import { useState, useRef, useEffect } from 'react';
import { fetchPregnancy } from '../api/pregnancy';
import { lookupTGA, TGA_UPDATED } from '../api/tgaLookup';
import TGACategoryBadge from './TGACategoryBadge';
import ExternalLinks from './ExternalLinks';
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

  const tga = lookupTGA(drug.title);

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
      const data = await fetchPregnancy(drug.fdaName || drug.title, controller.signal);
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
      <h2 className="text-lg font-bold tracking-tight text-sky-900 dark:text-slate-100">
        {drug.title}
      </h2>
      {drug.brandNames?.length > 0 && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Also sold as {drug.brandNames.slice().sort((a, b) => a.length - b.length).slice(0, 3).join(', ')}
        </p>
      )}

      {tga && <TGACategoryBadge category={tga.category} statement={tga.statement} updatedDate={TGA_UPDATED} />}

      {!tga && (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          No Australian TGA pregnancy category found for this drug.
        </p>
      )}

      {!pregnancy && !loading && !error && (
        <button
          onClick={ensurePregnancy}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-teal-600 active:bg-slate-50 dark:border-slate-800 dark:text-teal-400 dark:active:bg-slate-800"
        >
          Show FDA pregnancy labeling
        </button>
      )}

      {loading && !pregnancy && (
        <p className="mt-3 py-2 text-center text-sm text-slate-400 dark:text-slate-500">Loading FDA data...</p>
      )}

      {error && !pregnancy && (
        <p className="mt-3 py-2 text-center text-sm text-red-500 dark:text-red-400">{error}</p>
      )}

      {pregnancy && (
        <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              US FDA Labeling
            </h3>
            {drug.effectiveTime && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Label: {formatDate(drug.effectiveTime)}
              </span>
            )}
          </div>

          {pregnancy.riskSummary && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Risk Summary</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {pregnancy.riskSummary}
              </p>
            </div>
          )}

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

          {!pregnancy.riskSummary && !pregnancy.clinicalConsiderations && !pregnancy.data && !pregnancy.pregnancyRegistry && (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No FDA pregnancy labeling data available for this drug.
              </p>
            </div>
          )}
        </div>
      )}

      <ExternalLinks drugName={drug.title} />

      <div className="mt-4 flex justify-end">
        <ShareButton drugTitle={drug.title} />
      </div>
    </article>
  );
}
