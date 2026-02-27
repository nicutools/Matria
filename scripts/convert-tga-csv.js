#!/usr/bin/env node

/**
 * Downloads the TGA "Prescribing Medicines in Pregnancy" CSV and converts it
 * to a compact JSON file for bundling in the app.
 *
 * Run:  node scripts/convert-tga-csv.js
 *
 * The TGA updates this CSV a few times per year. Re-run when a new version is
 * published at:
 * https://www.tga.gov.au/resources/publication/publications/prescribing-medicines-pregnancy-database
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSV_URL =
  'https://www.tga.gov.au/sites/default/files/2025-12/medicines-pregnancy-current-database-2025-12-24.csv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/tgaPregnancy.json');

async function main() {
  console.log('Downloading TGA CSV...');
  const res = await fetch(CSV_URL);
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
      url: 'https://www.tga.gov.au/resources/publication/publications/prescribing-medicines-pregnancy-database',
      updated: '2025-12-24',
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
