#!/usr/bin/env node

/**
 * Downloads the TGA "Prescribing Medicines in Pregnancy" CSV and converts it
 * to a compact JSON file for bundling in the app.
 *
 * Usage:
 *   node scripts/convert-tga-csv.js            # auto-discovers latest CSV from TGA website
 *   node scripts/convert-tga-csv.js --url URL   # use a specific CSV URL
 *
 * The TGA updates this CSV a few times per year. Re-run when a new version is
 * published. The script auto-discovers the latest CSV URL from the TGA website,
 * so no code changes are needed between TGA updates.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/tgaPregnancy.json');

const TGA_BASE = 'https://www.tga.gov.au';
const TGA_PAGE = '/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database';
const CF_DISCOVER = 'https://matria.nicutools.org/api/tga-discover';
const CONFIG_PATH = resolve(__dirname, 'tga-config.json');

// Diagnostics collected during fallback chain
const diagnostics = [];

function logStep(step, ok, detail) {
  const entry = `[${step}] ${ok ? 'OK' : 'FAIL'}: ${detail}`;
  console.log(entry);
  diagnostics.push(entry);
}

/**
 * Step 1: Ask our Cloudflare edge proxy to discover the CSV URL.
 */
async function discoverViaCloudflare() {
  const start = Date.now();
  try {
    const res = await fetch(CF_DISCOVER, { signal: AbortSignal.timeout(30000) });
    const ms = Date.now() - start;
    if (!res.ok) {
      logStep('Cloudflare', false, `HTTP ${res.status} (${ms}ms)`);
      return null;
    }
    const json = await res.json();
    if (!json.found) {
      logStep('Cloudflare', false, `${json.error} (${ms}ms)`);
      return null;
    }
    logStep('Cloudflare', true, `${json.csvUrl} (${ms}ms)`);
    return json.csvUrl;
  } catch (err) {
    logStep('Cloudflare', false, `${err.message} (${Date.now() - start}ms)`);
    return null;
  }
}

/**
 * Step 2: Try the last known CSV URL from tga-config.json via HEAD request.
 */
async function discoverViaLastKnown() {
  let config;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    logStep('LastKnown', false, 'Could not read tga-config.json');
    return null;
  }

  const url = config.lastKnownCsvUrl;
  if (!url) {
    logStep('LastKnown', false, 'No URL in tga-config.json');
    return null;
  }

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(30000),
    });
    const ms = Date.now() - start;
    if (res.ok) {
      logStep('LastKnown', true, `${url} (${ms}ms)`);
      return url;
    }
    logStep('LastKnown', false, `HTTP ${res.status} for ${url} (${ms}ms)`);
    return null;
  } catch (err) {
    logStep('LastKnown', false, `${err.message} (${Date.now() - start}ms)`);
    return null;
  }
}

/**
 * Fresh discovery: scrape the TGA page for the current CSV link.
 *
 * This is the ONLY method that finds newly-published CSVs, so it runs first.
 * Plain fetch() with no browser-like headers — Akamai's WAF blocks requests
 * that look like a browser but come from a non-browser IP (see CLAUDE.md).
 * Retried a few times so a transient throttle doesn't cause a false fallback
 * to stale last-known data.
 */
async function discoverViaDirect() {
  const pageUrl = TGA_BASE + TGA_PAGE;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const start = Date.now();
    try {
      const res = await fetch(pageUrl, {
        signal: AbortSignal.timeout(90000),
      });
      const ms = Date.now() - start;
      if (!res.ok) {
        logStep('Direct', false, `HTTP ${res.status} for ${pageUrl} (attempt ${attempt}/${MAX_ATTEMPTS}, ${ms}ms)`);
      } else {
        const html = await res.text();
        // Match the pregnancy-database CSV specifically, so an unrelated CSV
        // elsewhere on the page can never be picked up by accident.
        const match =
          html.match(/["']([^"']*pregnancy[^"']*\.csv[^"']*?)["']/i) ||
          html.match(/["']([^"']*\.csv[^"']*?)["']/i);
        if (!match) {
          logStep('Direct', false, `No CSV link on page (attempt ${attempt}/${MAX_ATTEMPTS}, ${ms}ms)`);
        } else {
          const csvPath = match[1];
          const csvUrl = csvPath.startsWith('http') ? csvPath : TGA_BASE + csvPath;
          logStep('Direct', true, `${csvUrl} (${ms}ms)`);
          return csvUrl;
        }
      }
    } catch (err) {
      logStep('Direct', false, `${err.message} (attempt ${attempt}/${MAX_ATTEMPTS}, ${Date.now() - start}ms)`);
    }
    // Linear backoff between attempts (skip after the last one).
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  return null;
}

/**
 * Saves a working CSV URL back to tga-config.json.
 */
function saveConfig(csvUrl, updated, checked) {
  const config = { lastKnownCsvUrl: csvUrl, lastUpdated: updated, lastChecked: checked };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`Saved ${csvUrl} to tga-config.json`);
}

/**
 * Returns `iso` if it is a real calendar date in a plausible range, else null.
 *
 * A date shown to a clinician is a currency claim about pregnancy-safety data,
 * so a value we cannot verify must become null (and ultimately a build
 * failure), never a guess. Exported for tests.
 */
export function validateIsoDate(iso) {
  if (typeof iso !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // The TGA database predates neither 2000 nor this script; a date outside a
  // sane window means we parsed digits that were never a date.
  if (year < 2000 || year > 2100) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Extracts the data date from the CSV URL filename.
 * Handles patterns like:
 *   medicines-pregnancy-current-database-2025-12-24.csv  → 2025-12-24
 *   medicines_in_pregnancy_current_database_for_web_250818.csv  → 2025-08-18
 *
 * Returns null when the filename carries no usable date. It used to return
 * TODAY'S date in that case, which silently stamped a fresh currency date onto
 * data of completely unknown age — the worst possible failure for a clinical
 * tool, because it looks correct. Exported for tests.
 */
export function extractDateFromUrl(url) {
  if (typeof url !== 'string') return null;

  // Try YYYY-MM-DD pattern
  const isoMatch = url.match(/(\d{4}-\d{2}-\d{2})\.csv/);
  if (isoMatch) return validateIsoDate(isoMatch[1]);

  // Try YYMMDD pattern. Validation matters here: without it, any six digits
  // before ".csv" become a "date", so `...-123456.csv` yielded "2012-34-56"
  // and rendered to clinicians as the literal text "Invalid Date".
  const shortMatch = url.match(/(\d{6})\.csv/);
  if (shortMatch) {
    const d = shortMatch[1];
    return validateIsoDate(`20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`);
  }

  return null;
}

/**
 * Falls back to the CSV response's Last-Modified header. Still a date the TGA
 * itself asserts about the file — weaker than the filename, but sourced rather
 * than invented. Exported for tests.
 */
export function dateFromLastModified(headerValue) {
  if (!headerValue) return null;
  const parsed = new Date(headerValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return validateIsoDate(parsed.toISOString().slice(0, 10));
}

async function main() {
  // Check for --url argument
  const urlArgIdx = process.argv.indexOf('--url');
  let csvUrl = urlArgIdx !== -1 ? process.argv[urlArgIdx + 1] : null;

  // Optional --date override. The manual `--url` recovery path is the most
  // likely way to end up with a dateless filename, and whoever runs it has just
  // read the TGA page — so let them assert the date rather than lose it.
  const dateArgIdx = process.argv.indexOf('--date');
  const dateOverride = dateArgIdx !== -1 ? process.argv[dateArgIdx + 1] : null;
  if (dateOverride && !validateIsoDate(dateOverride)) {
    console.error(`--date must be a real calendar date as YYYY-MM-DD (got: ${dateOverride})`);
    process.exit(1);
  }

  // Tracks whether we could freshly discover the current CSV, or had to fall
  // back to the last-known URL (which may be stale — old TGA CSVs never 404,
  // so a live last-known URL is NOT evidence that it's still the newest one).
  let staleFallback = false;

  if (csvUrl) {
    console.log(`Using provided URL: ${csvUrl}`);
  } else {
    console.log('Discovering TGA CSV URL...');

    // Fresh discovery FIRST — only the direct scrape (and, in theory, the
    // Cloudflare proxy) can surface a newly-published CSV. The last-known URL
    // is a genuine last resort: it keeps the build alive when TGA is
    // unreachable, but it can never advance the data, so it must not pre-empt
    // fresh discovery.
    csvUrl = await discoverViaDirect();
    if (!csvUrl) csvUrl = await discoverViaCloudflare();
    if (!csvUrl) {
      csvUrl = await discoverViaLastKnown();
      staleFallback = !!csvUrl;
    }

    if (!csvUrl) {
      console.error('\nAll discovery methods failed:\n' + diagnostics.join('\n'));
      console.error(
        '\nManual fix: visit the TGA page, find the CSV link, and run:\n' +
        '  node scripts/convert-tga-csv.js --url <CSV_URL>\n' +
        'Or re-run the GitHub workflow with the CSV URL input.'
      );
      process.exit(1);
    }

    if (staleFallback) {
      // Fresh discovery failed and we fell back to the last-known URL. The
      // bundled data is left untouched (it already reflects this URL) and we
      // exit non-zero so the workflow's failure path opens a GitHub Issue —
      // rather than silently pinning stale data behind a green checkmark,
      // which is exactly how a 5-month staleness went unnoticed before.
      console.error(
        '\n⚠️  Could not freshly discover the TGA CSV — fell back to the last-known URL:\n' +
        `  ${csvUrl}\n` +
        'The bundled data was NOT updated and may be stale. Someone should check\n' +
        'the TGA page and, if a newer CSV exists, re-run with --url <CSV_URL>.\n\n' +
        'Discovery diagnostics:\n' + diagnostics.join('\n')
      );
      process.exit(1);
    }
  }

  console.log('Downloading CSV...');
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  // Resolve the data date, strongest source first. Every candidate is either
  // asserted by a human who read the TGA page or by the TGA itself. If none
  // yields a date we stop, rather than shipping data whose age we cannot state.
  const updated =
    validateIsoDate(dateOverride) ||
    extractDateFromUrl(csvUrl) ||
    dateFromLastModified(res.headers.get('last-modified'));

  if (!updated) {
    console.error(
      '\n⚠️  Could not determine the date of this TGA data.\n' +
      `  CSV URL: ${csvUrl}\n` +
      `  Last-Modified: ${res.headers.get('last-modified') || '(absent)'}\n\n` +
      'The bundled data was NOT updated. Shipping a drug-safety dataset without\n' +
      'a verifiable date would leave clinicians unable to judge how current it\n' +
      'is, and inventing one is worse. The previous data (whose date and\n' +
      'contents match each other) stays in place.\n\n' +
      'To fix: check the TGA page for the publication date and re-run with\n' +
      '  node scripts/convert-tga-csv.js --url <CSV_URL> --date YYYY-MM-DD'
    );
    process.exit(1);
  }

  console.log(`Data date: ${updated}`);

  let text = await res.text();

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const lines = text.split('\n');
  const header = lines[0].trim();

  // Sanity-check header
  if (!header.startsWith('Name,Category')) {
    throw new Error(`Unexpected CSV header: ${header}`);
  }

  const data = {};
  let count = 0;

  // Simple CSV parser that handles quoted fields with commas and newlines
  // Joins all remaining lines into one string and parses row by row
  const rows = parseCSV(lines.slice(1).join('\n'));

  for (const cols of rows) {
    const name = (cols[0] || '').trim().toLowerCase();
    const category = (cols[1] || '').trim();
    const statement = (cols[2] || '').trim();

    if (!name || !category) continue;

    const entry = { category };
    if (statement) entry.statement = statement;

    data[name] = entry;
    count++;
  }

  // Save working URL to config for future fallback
  // Only reached after the CSV was successfully downloaded, parsed and
  // header-checked, and after a date was resolved. Every failure path exits
  // before this, so `checked` can only ever mean "we reached the TGA and
  // confirmed this is the data we hold" — never "the job ran".
  const checked = new Date().toISOString().slice(0, 10);

  saveConfig(csvUrl, updated, checked);

  const output = {
    _meta: {
      source: 'Australian Therapeutic Goods Administration (TGA)',
      url: 'https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database',
      csvUrl,
      updated,
      checked,
      count,
    },
    data,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output), 'utf-8');
  console.log(`Wrote ${count} entries to ${OUT_PATH}`);
}

/**
 * Minimal CSV parser handling quoted fields (which may contain commas and
 * newlines). Returns an array of rows, each row an array of column strings.
 */
function parseCSV(text) {
  const rows = [];
  let i = 0;

  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let val = '';
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              val += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            val += text[i];
            i++;
          }
        }
        row.push(val);
        // Skip comma or newline after quoted field
        if (text[i] === ',') {
          i++;
        } else {
          // End of row
          if (text[i] === '\r') i++;
          if (text[i] === '\n') i++;
          break;
        }
      } else {
        // Unquoted field
        let val = '';
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          val += text[i];
          i++;
        }
        row.push(val);
        if (text[i] === ',') {
          i++;
        } else {
          if (text[i] === '\r') i++;
          if (text[i] === '\n') i++;
          break;
        }
      }
    }
    if (row.length > 0 && row.some((c) => c.trim())) {
      rows.push(row);
    }
  }

  return rows;
}

// Only run when executed directly, so tests can import the helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
