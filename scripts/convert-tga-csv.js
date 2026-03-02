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

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/tgaPregnancy.json');

const TGA_BASE = 'https://www.tga.gov.au';

// Pages known to contain a direct CSV download link (ordered by preference)
const DISCOVERY_PAGES = [
  '/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database',
  '/table/medicines-pregnancy-current-database-web',
];

/**
 * Fetches TGA pages and extracts the first .csv link found.
 * Returns the full URL or null.
 */
async function discoverCsvUrl() {
  for (const path of DISCOVERY_PAGES) {
    const pageUrl = TGA_BASE + path;
    console.log(`Checking ${pageUrl} ...`);
    try {
      const res = await fetch(pageUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(/["']([^"']*\.csv[^"']*?)["']/i);
      if (match) {
        const csvPath = match[1];
        const csvUrl = csvPath.startsWith('http') ? csvPath : TGA_BASE + csvPath;
        return csvUrl;
      }
    } catch {
      // Page timed out or failed — try next
    }
  }
  return null;
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
    console.log('Auto-discovering latest TGA CSV...');
    csvUrl = await discoverCsvUrl();
    if (!csvUrl) {
      console.error(
        'Could not auto-discover CSV URL from TGA website.\n' +
        'Visit https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database\n' +
        'and run: node scripts/convert-tga-csv.js --url <CSV_URL>'
      );
      process.exit(1);
    }
    console.log(`Found: ${csvUrl}`);
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
