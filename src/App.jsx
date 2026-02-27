import { useState, useEffect, useRef } from 'react';
import SearchBar from './components/SearchBar';
import DrugCard from './components/DrugCard';
import BrandBadge from './components/BrandBadge';
import Disclaimer from './components/Disclaimer';
import HomePage from './components/HomePage';
import { searchDrugs } from './api/dailymed';
import { resolveBrand } from './api/brandResolver';

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

function App() {
  const [query, setQuery] = useState(() => getUrlDrug());
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [searched, setSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const isDeepLink = useRef(!!getUrlDrug());

  useEffect(() => {
    clearTimeout(debounceRef.current);

    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setError(null);
      setResolution(null);
      setSearched(false);
      return;
    }

    if (trimmed.length < 3) {
      setResults([]);
      setError(null);
      setResolution(null);
      setSearched(false);
      return;
    }

    setLoading(true);
    setResults([]);
    setError(null);
    setSearched(false);
    setSelectedIndex(null);

    const delay = isDeepLink.current ? 0 : 350;
    const deepLinkDrug = isDeepLink.current ? getUrlDrug() : null;
    isDeepLink.current = false;

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const brandResult = await resolveBrand(query, controller.signal);
        setResolution(brandResult.resolved ? brandResult : null);

        const { results: data } = await searchDrugs(brandResult.generic, controller.signal);
        setResults(data);
        setSearched(true);

        // Deep link auto-select: if came from URL and an exact match exists, select it
        if (deepLinkDrug && data.length > 1) {
          const exactIdx = data.findIndex(
            (d) => d.title.toLowerCase() === deepLinkDrug.toLowerCase()
          );
          if (exactIdx !== -1) {
            setSelectedIndex(exactIdx);
          }
        }

        // Single result: update URL without creating a history entry
        if (data.length === 1) {
          replaceDrug(data[0].title);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Search error:', err);
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

      // If we already have results, try to find the drug in current results
      setQuery(drug);
      if (results.length > 0) {
        const idx = results.findIndex(
          (d) => d.title.toLowerCase() === drug.toLowerCase()
        );
        setSelectedIndex(idx !== -1 ? idx : null);
      } else {
        // Need a fresh search
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
            Searching...
          </p>
        )}

        {error && (
          <p className="py-12 text-center text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No results found. Try a drug or brand name (e.g. "Sertraline").
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
                key={drug.title || i}
                onClick={() => handleResultTap(i)}
                className="w-full rounded-2xl bg-white px-4 py-3 text-left text-sm font-medium text-sky-900 shadow-sm active:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none dark:active:bg-slate-800"
              >
                {drug.title}
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
