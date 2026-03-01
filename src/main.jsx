import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

Sentry.init({
  dsn: 'https://03ebc0759f4fb531f2b5108e85576263@o4510967677452288.ingest.us.sentry.io/4510967692132352',
  release: 'matria@1.0.1',
  environment: window.location.hostname === 'matria.nicutools.org' ? 'production' : 'development',
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/[?&]drug=[^&]*/g, '');
    }
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'fetch' && breadcrumb.data?.url?.includes('/api/')) {
      try {
        const url = new URL(breadcrumb.data.url, window.location.origin);
        url.search = '';
        breadcrumb.data.url = url.toString();
      } catch {
        // leave breadcrumb as-is
      }
    }
    return breadcrumb;
  },
});

function ErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-slate-950">
      <svg className="h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <h1 className="mt-4 text-lg font-bold text-sky-900 dark:text-slate-100">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
        An unexpected error occurred. Please reload the page.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 rounded-2xl bg-teal-600 px-6 py-3 text-sm font-medium text-white active:bg-teal-700"
      >
        Reload
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(() => {
      // Warm cache with common drug searches in the background
      // Skip if user arrived with a deep link (they're already searching)
      if (!new URLSearchParams(window.location.search).get('drug')) {
        setTimeout(() => warmCommonDrugs(), 5000);
      }
    }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

async function warmCommonDrugs() {
  // TGA search is instant (local), so warm the FDA pregnancy endpoint
  // for common drugs that users are likely to tap "Show FDA labeling" on
  const drugs = [
    'paracetamol', 'sertraline', 'levothyroxine', 'ondansetron',
    'metformin', 'azithromycin', 'amoxicillin', 'ibuprofen',
  ];

  const { fetchPregnancy } = await import('./api/pregnancy.js');

  for (const drug of drugs) {
    try {
      await fetchPregnancy(drug);
    } catch {
      // Silently skip failures
    }
    // 1s gap between drugs to avoid hammering OpenFDA
    await new Promise((r) => setTimeout(r, 1000));
  }
}
