/**
 * Fetches the TGA pregnancy CSV through a real, headed Chromium.
 *
 * Since September 2026 the TGA's Akamai front end resets the connection for
 * every non-browser client — Node fetch, curl, a Cloudflare Worker — and for
 * headless Chromium too, from GitHub runners and residential IPs alike. A
 * headed browser gets through from the same machines. So this launches one
 * (under xvfb-run in CI, where there is no display), reads the CSV link off the
 * rendered page, and downloads the CSV from inside the page so the request
 * carries the browser's own fingerprint and cookies.
 *
 * Playwright is imported lazily so the converter, and its tests, still load on
 * a machine without it.
 */

const NAV_TIMEOUT_MS = 60000;

/**
 * @param {string} pageUrl  the TGA database page
 * @param {(hrefs: string[]) => string | null} pickCsvLink
 * @param {string | null} csvUrl  a known CSV URL, skipping discovery
 * @returns {Promise<{ csvUrl: string, text: string, lastModified: string | null }>}
 */
export async function fetchViaBrowser(pageUrl, pickCsvLink, csvUrl = null) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    // Always load the page, even with a known CSV URL: it is what earns the
    // session Akamai accepts, and the CSV request then goes out from it.
    const res = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    if (!res || !res.ok()) throw new Error(`TGA page returned HTTP ${res ? res.status() : 'none'}`);

    if (!csvUrl) {
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
      csvUrl = pickCsvLink(hrefs);
      if (!csvUrl) throw new Error('No CSV link on the rendered TGA page');
    }

    const result = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return { ok: r.ok, status: r.status, lastModified: r.headers.get('last-modified'), text: await r.text() };
    }, csvUrl);
    if (!result.ok) throw new Error(`CSV download returned HTTP ${result.status}`);

    return { csvUrl, text: result.text, lastModified: result.lastModified };
  } finally {
    await browser.close();
  }
}
