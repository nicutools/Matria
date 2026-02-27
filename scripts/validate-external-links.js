#!/usr/bin/env node

/**
 * Scrapes BUMPS (UK) and MotherToBaby (US) index pages to extract verified
 * leaflet/fact-sheet slugs. Writes static JSON files so ExternalLinks only
 * shows links that actually exist.
 *
 * Usage:
 *   node scripts/validate-external-links.js
 *
 * Run periodically (e.g. monthly) to pick up new leaflets.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUMPS_OUT = resolve(__dirname, '../src/data/bumpsLinks.json');
const MTB_OUT = resolve(__dirname, '../src/data/motherToBabyLinks.json');

/**
 * Fetches the BUMPS A-Z index and extracts all leaflet slugs.
 * Links look like: href="/leaflets-a-z/paracetamol/"
 */
async function fetchBumps() {
  const url = 'https://www.medicinesinpregnancy.org/leaflets-a-z/';
  console.log(`Fetching BUMPS index: ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`BUMPS fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const slugs = new Set();
  const regex = /href=["']\/leaflets-a-z\/([^/"']+)\/?["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    slugs.add(match[1].toLowerCase());
  }

  return [...slugs].sort();
}

/**
 * Fetches the MotherToBaby fact sheets index and extracts all slugs.
 * Links look like: href="https://mothertobaby.org/fact-sheets/acetaminophen-pregnancy/"
 * or relative: href="/fact-sheets/acetaminophen-pregnancy/"
 */
async function fetchMotherToBaby() {
  const url = 'https://mothertobaby.org/fact-sheets/';
  console.log(`Fetching MotherToBaby index: ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`MotherToBaby fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const slugs = new Set();
  const regex = /href=["'](?:https?:\/\/mothertobaby\.org)?\/fact-sheets\/([^/"'#?]+)\/?["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    slugs.add(match[1].toLowerCase());
  }

  return [...slugs].sort();
}

async function main() {
  const [bumps, mtb] = await Promise.all([fetchBumps(), fetchMotherToBaby()]);

  writeFileSync(BUMPS_OUT, JSON.stringify(bumps, null, 2) + '\n', 'utf-8');
  console.log(`BUMPS: ${bumps.length} verified slugs → ${BUMPS_OUT}`);

  writeFileSync(MTB_OUT, JSON.stringify(mtb, null, 2) + '\n', 'utf-8');
  console.log(`MotherToBaby: ${mtb.length} verified slugs → ${MTB_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
