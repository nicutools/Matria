/* global __APP_VERSION__ */
/**
 * First-party usage counters.
 *
 * Sends anonymous "the app was opened" / "this drug was viewed" counts to
 * stats.nicutools.org, a service we run ourselves. No cookies, no session or
 * user identifier, no third party.
 *
 * The only variable ever transmitted is a drug name, and only after it has been
 * SLUGIFIED to [a-z0-9-]. Search queries are never sent: recordDrugView is
 * called with a resolved result title, never with what someone typed. The
 * slugify step is a second barrier — even if a raw query reached it, anything
 * that is not a clean slug is dropped rather than sent.
 *
 * Offline-safe: events queue in localStorage and are retried on a later visit.
 */

const ENDPOINT = 'https://stats.nicutools.org/e';
const PROPERTY = 'matria';
const PLATFORM = 'web';
const QUEUE_KEY = 'usage-queue';
const DEBUG_KEY = 'usage-debug';

const MAX_QUEUE = 50; // matches the server's per-batch ceiling
const FLUSH_INTERVAL_MS = 30000;

/** Mirrors the ingest service's subject allowlist exactly. */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

let queue = [];
let started = false;

function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** Local development must not pollute production counts. */
export function isEnabled() {
  if (!isBrowser()) return false;
  try {
    if (localStorage.getItem(DEBUG_KEY) === '1') return true;
  } catch {
    return false;
  }
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local');
}

/** "Amoxicillin + Clavulanic acid" -> "amoxicillin-clavulanic-acid" */
export function slugify(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function saveQueue() {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Storage full or blocked. A counter is never worth an error.
  }
}

function enqueue(name, subject) {
  if (!isEnabled()) return;
  const event = {
    name,
    property: PROPERTY,
    platform: PLATFORM,
    app_version: __APP_VERSION__,
    ts: Date.now(), // epoch MILLISECONDS
  };
  if (subject) {
    if (!SLUG.test(subject)) return; // never send anything unexpected
    event.subject = subject;
  }
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  saveQueue();
  start();
}

export function flush(useBeacon = false) {
  if (!isEnabled() || queue.length === 0) return;
  // Genuinely offline: keep everything queued rather than attempting a send
  // whose outcome we could not interpret.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const batch = queue.slice(0, MAX_QUEUE);
  const body = JSON.stringify(batch);

  // text/plain avoids a CORS preflight round-trip.
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) {
      queue = queue.slice(batch.length);
      saveQueue();
    }
    return;
  }

  queue = queue.slice(batch.length);
  saveQueue();

  fetch(ENDPOINT, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'text/plain' },
    keepalive: true,
  })
    .then((res) => {
      // 5xx means try again later. 4xx means the batch is bad — discard it.
      if (res.status >= 500) {
        queue = [...batch, ...queue].slice(-MAX_QUEUE);
        saveQueue();
      }
    })
    .catch(() => {
      // Ambiguous: a rejected fetch while online may still have reached the
      // server, so re-sending risks double-counting. For usage counters an
      // occasional undercount is much safer than silent inflation.
    });
}

function start() {
  if (started || !isEnabled()) return;
  started = true;
  setInterval(() => flush(), FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('online', () => flush());
}

/** Call once when the app loads. */
export function recordAppOpened() {
  if (!isEnabled()) return;
  if (queue.length === 0) queue = loadQueue(); // retry anything stranded offline
  enqueue('app_opened', null);
}

/**
 * Call with a RESOLVED drug title from the dataset — never with a raw search
 * query. The title is slugified before it leaves the browser.
 */
export function recordDrugView(title) {
  enqueue('drug_viewed', slugify(title));
}
