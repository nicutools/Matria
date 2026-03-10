import { useState, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import SearchBar from './components/SearchBar';
import DrugCard from './components/DrugCard';
import BrandBadge from './components/BrandBadge';
import Disclaimer from './components/Disclaimer';
import HomePage, { addRecentSearch } from './components/HomePage';
import { searchTGA } from './api/tgaSearch';
import { searchDrugs } from './api/search';
import { resolveLocalBrand, resolveBrand } from './api/brandResolver';

function logDrugView(drugName) {
  fetch(`/api/count?q=${encodeURIComponent(drugName)}`).catch(() => {});
}

function getUrlDrug() {
  return new URLSearchParams(window.location.search).get('drug') || '';
}

function pushDrug(title) {
  const url = new URL(window.location.href);
  url.searchParams.set('drug', title);
  history.pushState(null, '', url);
}

function replaceDrug(title) {
  const url = new URL(window.location.href);
  url.searchParams.set('drug', title);
  history.replaceState(null, '', url);
}

function clearDrugParam(push) {
  const url = new URL(window.location.href);
  url.searchParams.delete('drug');
  const href = url.searchParams.toString() ? url.toString() : url.pathname;
  if (push) {
    history.pushState(null, '', href);
  } else {
    history.replaceState(null, '', href);
  }
}

const CATEGORY_ORDER = { A: 0, B1: 1, B2: 2, B3: 3, C: 4, D: 5, X: 6 };

const CATEGORY_COLORS = {
  A: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  B1: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  B2: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  B3: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  C: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  D: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  X: 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200',
};

function App() {
  const [query, setQuery] = useState(() => getUrlDrug());
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [searched, setSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const debounceRef = useRef(null);
  const recentDebounceRef = useRef(null);
  const abortRef = useRef(null);
  const isDeepLink = useRef(!!getUrlDrug());

  useEffect(() => {
    clearTimeout(debounceRef.current);
    clearTimeout(recentDebounceRef.current);
    abortRef.current?.abort();

    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setError(null);
      setResolution(null);
      setSearched(false);
      setLoading(false);
      return;
    }

    if (trimmed.length < 3) {
      setResults([]);
      setError(null);
      setResolution(null);
      setSearched(false);
      setLoading(false);
      return;
    }

    const deepLinkDrug = isDeepLink.current ? getUrlDrug() : null;
    isDeepLink.current = false;

    // --- Step 1: Local brand resolution (sync, instant) ---
    const brand = resolveLocalBrand(trimmed);
    const searchQuery = brand ? brand.generic : trimmed;

    // --- Step 2: TGA search (sync, instant) ---
    const tgaHits = searchTGA(searchQuery);

    if (tgaHits.length > 0) {
      // TGA results — show immediately, no loading state
      setResolution(brand || null);
      setResults(tgaHits);
      setSearched(true);
      setLoading(false);
      setError(null);
      setSelectedIndex(null);

      // Only save recent search for single results (title is canonical);
      // multi-result saves happen when user taps a result in handleResultTap
      if (tgaHits.length === 1) {
        recentDebounceRef.current = setTimeout(() => {
          addRecentSearch(tgaHits[0].title);
          logDrugView(tgaHits[0].title);
        }, 1000);
      }

      // Deep link auto-select
      if (deepLinkDrug && tgaHits.length > 1) {
        const exactIdx = tgaHits.findIndex(
          (d) => d.title.toLowerCase() === deepLinkDrug.toLowerCase()
        );
        if (exactIdx !== -1) setSelectedIndex(exactIdx);
      }

      // Single result: update URL
      if (tgaHits.length === 1) replaceDrug(tgaHits[0].title);
      return;
    }

    // --- Step 3: FDA fallback (async, debounced) ---
    setLoading(true);
    setResults([]);
    setError(null);
    setSearched(false);
    setSelectedIndex(null);

    const delay = deepLinkDrug ? 0 : 350;

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const brandResult = await resolveBrand(query, controller.signal);
        setResolution(brandResult.resolved ? brandResult : brand || null);

        const { results: data } = await searchDrugs(brandResult.generic, controller.signal);

        // For international name resolutions, keep original as display title
        if (brandResult.type === 'international') {
          const originalTitle = brandResult.original.charAt(0).toUpperCase() + brandResult.original.slice(1).toLowerCase();
          for (const drug of data) {
            drug.fdaName = drug.title;
            drug.title = originalTitle;
          }
        }

        // Tag as FDA source
        for (const drug of data) {
          drug.source = 'fda';
        }

        setResults(data);
        setSearched(true);

        // Only save recent search for single results;
        // multi-result saves happen when user taps a result
        if (data.length === 1) {
          addRecentSearch(data[0].title);
          logDrugView(data[0].title);
        }

        if (deepLinkDrug && data.length > 1) {
          const exactIdx = data.findIndex(
            (d) => d.title.toLowerCase() === deepLinkDrug.toLowerCase()
          );
          if (exactIdx !== -1) setSelectedIndex(exactIdx);
        }

        if (data.length === 1) replaceDrug(data[0].title);
      } catch (err) {
        if (err.name !== 'AbortError') {
          Sentry.captureException(err, { tags: { action: 'fda-search' } });
          setError('Unable to reach the FDA database. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Handle browser back/forward
  useEffect(() => {
    function handlePopState() {
      const drug = getUrlDrug();
      if (!drug) {
        setQuery('');
        setSelectedIndex(null);
        return;
      }

      setQuery(drug);
      if (results.length > 0) {
        const idx = results.findIndex(
          (d) => d.title.toLowerCase() === drug.toLowerCase()
        );
        setSelectedIndex(idx !== -1 ? idx : null);
      } else {
        isDeepLink.current = true;
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [results]);

  function handleDrugSelect(name) {
    isDeepLink.current = true;
    setQuery(name);
  }

  function handleResultTap(i) {
    setSelectedIndex(i);
    pushDrug(results[i].title);
    addRecentSearch(results[i].title);
    logDrugView(results[i].title);
  }

  function handleBackToList() {
    setSelectedIndex(null);
    clearDrugParam(true);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-slate-950">
      <SearchBar query={query} onChange={(val) => {
        setQuery(val);
        if (!val.trim()) clearDrugParam(false);
      }} onHomeClick={() => {
        setQuery('');
        setSelectedIndex(null);
        clearDrugParam(false);
      }} />

      <main className="mx-auto max-w-lg px-4 py-4">
        {resolution && (
          <BrandBadge
            original={resolution.original}
            generic={resolution.generic}
            type={resolution.type}
          />
        )}

        {loading && (
          <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            Searching FDA database...
          </p>
        )}

        {error && (
          <p className="py-12 text-center text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No results found. Try a drug or brand name (e.g. &ldquo;Sertraline&rdquo;).
          </p>
        )}

        {!loading && !error && query.trim().length > 0 && query.trim().length < 3 && (
          <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            Type at least 3 characters to search.
          </p>
        )}

        {!loading && !error && !query.trim() && (
          <>
            <HomePage onDrugSelect={handleDrugSelect} />
            <Disclaimer />
          </>
        )}

        {results.length === 1 && (
          <DrugCard drug={results[0]} />
        )}

        {results.length > 1 && selectedIndex === null && (
          <div className="flex flex-col gap-1">
            <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
              {results.length} results — tap to view
            </p>
            {results.map((drug, i) => (
              <button
                key={drug.tgaName || drug.title || i}
                onClick={() => handleResultTap(i)}
                className="flex w-full items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-left text-sm font-medium text-sky-900 shadow-sm active:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none dark:active:bg-slate-800"
              >
                {drug.source === 'tga' && drug.category && (
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold ${CATEGORY_COLORS[drug.category] || ''}`}>
                    {drug.category}
                  </span>
                )}
                <span className="min-w-0 flex-1">{drug.title}</span>
                {drug.source === 'fda' && drug.hasPregnancyData === false && (
                  <span className="text-xs text-slate-300 dark:text-slate-600">No FDA data</span>
                )}
              </button>
            ))}
          </div>
        )}

        {results.length > 1 && selectedIndex !== null && (
          <div>
            <button
              onClick={handleBackToList}
              className="mb-3 flex min-h-11 items-center gap-1 text-sm font-medium text-teal-600 active:text-teal-800 dark:text-teal-400 dark:active:text-teal-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              All results
            </button>
            <DrugCard drug={results[selectedIndex]} />
          </div>
        )}

        {results.length > 0 && <Disclaimer />}
      </main>
    </div>
  );
}

export default App;
