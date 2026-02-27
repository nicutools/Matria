import { useState } from 'react';

export default function ShareButton({ drugTitle }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set('drug', drugTitle);
    const shareUrl = url.toString();

    if (navigator.share) {
      try {
        await navigator.share({ title: `${drugTitle} — Matria`, url: shareUrl });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable
    }
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-800 active:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
    >
      {copied ? (
        <>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Link copied!
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0-12.814a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0 12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          Share
        </>
      )}
    </button>
  );
}
