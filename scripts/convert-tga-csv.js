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
import { fileURLToPath } from 'node:url';

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
 * Step 3: Scrape the TGA page directly (last resort).
 */
async function discoverViaDirect() {
  const pageUrl = TGA_BASE + TGA_PAGE;
  const start = Date.now();
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(90000),
    });
    const ms = Date.now() - start;
    if (!res.ok) {
      logStep('Direct', false, `HTTP ${res.status} for ${pageUrl} (${ms}ms)`);
      return null;
    }
    const html = await res.text();
    const match = html.match(/["']([^"']*\.csv[^"']*?)["']/i);
    if (!match) {
      logStep('Direct', false, `No CSV link on page (${ms}ms)`);
      return null;
    }
    const csvPath = match[1];
    const csvUrl = csvPath.startsWith('http') ? csvPath : TGA_BASE + csvPath;
    logStep('Direct', true, `${csvUrl} (${ms}ms)`);
    return csvUrl;
  } catch (err) {
    logStep('Direct', false, `${err.message} (${Date.now() - start}ms)`);
    return null;
  }
}

/**
 * Saves a working CSV URL back to tga-config.json.
 */
function saveConfig(csvUrl, updated) {
  const config = { lastKnownCsvUrl: csvUrl, lastUpdated: updated };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`Saved ${csvUrl} to tga-config.json`);
}

/**
 * Extracts a date from the CSV URL filename for the _meta.updated field.
 * Handles patterns like:
 *   medicines-pregnancy-current-database-2025-12-24.csv  → 2025-12-24
 *   medicines_in_pregnancy_current_database_for_web_250818.csv  → 2025-08-18
 */
function extractDateFromUrl(url) {
  // Try YYYY-MM-DD pattern
  const isoMatch = url.match(/(\d{4}-\d{2}-\d{2})\.csv/);
  if (isoMatch) return isoMatch[1];

  // Try YYMMDD pattern
  const shortMatch = url.match(/(\d{6})\.csv/);
  if (shortMatch) {
    const s = shortMatch[1];
    return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  }

  // Fallback to today
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  // Check for --url argument
  const urlArgIdx = process.argv.indexOf('--url');
  let csvUrl = urlArgIdx !== -1 ? process.argv[urlArgIdx + 1] : null;

  if (csvUrl) {
    console.log(`Using provided URL: ${csvUrl}`);
  } else {
    console.log('Discovering TGA CSV URL...');

    // Fallback chain: Cloudflare → last known → direct scrape
    csvUrl = await discoverViaCloudflare();
    if (!csvUrl) csvUrl = await discoverViaLastKnown();
    if (!csvUrl) csvUrl = await discoverViaDirect();

    if (!csvUrl) {
      console.error('\nAll discovery methods failed:\n' + diagnostics.join('\n'));
      console.error(
        '\nManual fix: visit the TGA page, find the CSV link, and run:\n' +
        '  node scripts/convert-tga-csv.js --url <CSV_URL>\n' +
        'Or re-run the GitHub workflow with the CSV URL input.'
      );
      process.exit(1);
    }
  }

  const updated = extractDateFromUrl(csvUrl);
  console.log(`Data date: ${updated}`);

  console.log('Downloading CSV...');
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

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
  saveConfig(csvUrl, updated);

  const output = {
    _meta: {
      source: 'Australian Therapeutic Goods Administration (TGA)',
      url: 'https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database',
      csvUrl,
      updated,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
