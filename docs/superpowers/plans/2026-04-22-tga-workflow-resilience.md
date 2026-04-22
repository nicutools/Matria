# TGA Workflow Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the monthly TGA data update workflow resilient to TGA website outages, with self-healing fallback and friendly failure notifications.

**Architecture:** A Cloudflare Pages Function proxies TGA page discovery via edge network. The convert script uses a 4-step fallback chain (Cloudflare → last known URL → direct scrape → fail). The workflow runs external link validation regardless of TGA outcome and auto-creates a GitHub Issue on failure.

**Tech Stack:** Cloudflare Pages Functions, Node.js scripts, GitHub Actions, GitHub CLI (`gh`)

---

## File Structure

| File | Role |
|:---|:---|
| `functions/api/tga-discover.js` | **New** — Cloudflare edge proxy that fetches TGA page and extracts CSV link |
| `scripts/tga-config.json` | **New** — stores last known working CSV URL, auto-updated on success |
| `scripts/convert-tga-csv.js` | **Modified** — replace `discoverCsvUrl()` with fallback chain, add browser headers, auto-save config |
| `.github/workflows/update-data.yml` | **Modified** — non-blocking TGA step, `csv_url` input, GitHub Issue on failure |

---

### Task 1: Create `scripts/tga-config.json`

**Files:**
- Create: `scripts/tga-config.json`

- [ ] **Step 1: Create the config file**

```json
{
  "lastKnownCsvUrl": "https://www.tga.gov.au/sites/default/files/2025-12/medicines-pregnancy-current-database-2025-12-24.csv",
  "lastUpdated": "2025-12-24"
}
```

- [ ] **Step 2: Verify the saved URL is still valid**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 30 "https://www.tga.gov.au/sites/default/files/2025-12/medicines-pregnancy-current-database-2025-12-24.csv"
```

Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add scripts/tga-config.json
git commit -m "feat: add tga-config.json with last known CSV URL"
```

---

### Task 2: Create Cloudflare discovery function

**Files:**
- Create: `functions/api/tga-discover.js`

- [ ] **Step 1: Create the Pages Function**

```js
const TGA_PAGE = 'https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database';
const TGA_BASE = 'https://www.tga.gov.au';

export async function onRequest() {
  try {
    const res = await fetch(TGA_PAGE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Matria/1.0; +https://matria.nicutools.org)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return Response.json(
        { found: false, error: `TGA returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const html = await res.text();
    const match = html.match(/["']([^"']*\.csv[^"']*?)["']/i);

    if (!match) {
      return Response.json(
        { found: false, error: 'No CSV link found on TGA page' },
        { status: 404 },
      );
    }

    const csvPath = match[1];
    const csvUrl = csvPath.startsWith('http') ? csvPath : TGA_BASE + csvPath;

    return Response.json(
      { found: true, csvUrl },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return Response.json(
      { found: false, error: `Fetch failed: ${err.message}` },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Build and test locally**

Run:
```bash
npm run build && npx wrangler pages dev dist
```

Then in another terminal:
```bash
curl -s http://localhost:8788/api/tga-discover | jq .
```

Expected: `{ "found": true, "csvUrl": "https://www.tga.gov.au/sites/default/files/..." }`

- [ ] **Step 3: Commit**

```bash
git add functions/api/tga-discover.js
git commit -m "feat: add Cloudflare edge proxy for TGA CSV discovery"
```

---

### Task 3: Rewrite `convert-tga-csv.js` discovery with fallback chain

**Files:**
- Modify: `scripts/convert-tga-csv.js:23-96` (replace constants + `discoverCsvUrl()` + discovery section of `main()`)

- [ ] **Step 1: Replace the constants and `discoverCsvUrl()` with fallback chain functions**

Replace lines 23–54 (the `TGA_BASE`, `DISCOVERY_PAGES`, and `discoverCsvUrl()` function) with:

```js
const TGA_BASE = 'https://www.tga.gov.au';
const TGA_PAGE = '/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database';
const CF_DISCOVER = 'https://matria.nicutools.org/api/tga-discover';
const CONFIG_PATH = resolve(__dirname, 'tga-config.json');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Matria/1.0; +https://matria.nicutools.org)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

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
      headers: BROWSER_HEADERS,
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
      headers: BROWSER_HEADERS,
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
```

- [ ] **Step 2: Add `readFileSync` to the import at line 16**

Change:
```js
import { writeFileSync } from 'node:fs';
```
To:
```js
import { readFileSync, writeFileSync } from 'node:fs';
```

- [ ] **Step 3: Replace the discovery section of `main()`**

Replace lines 78–97 (from `async function main()` opening through the `csvUrl` discovery block, up to but not including `const updated = extractDateFromUrl(csvUrl);`) with:

```js
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
```

- [ ] **Step 4: Add config save after successful CSV download**

Find this line (after the CSV is parsed and count is known, just before `writeFileSync(OUT_PATH, ...)`):
```js
  const output = {
```

Add this line immediately before it:
```js
  // Save working URL to config for future fallback
  saveConfig(csvUrl, updated);

```

- [ ] **Step 5: Test locally — full fallback chain**

Run:
```bash
node scripts/convert-tga-csv.js
```

Expected output includes `Discovering TGA CSV URL...` and succeeds via one of the three methods. Check that `scripts/tga-config.json` was updated.

- [ ] **Step 6: Test locally — manual override still works**

Run:
```bash
node scripts/convert-tga-csv.js --url "https://www.tga.gov.au/sites/default/files/2025-12/medicines-pregnancy-current-database-2025-12-24.csv"
```

Expected: `Using provided URL: ...` then succeeds.

- [ ] **Step 7: Verify tga-config.json was updated**

Run:
```bash
cat scripts/tga-config.json
```

Expected: `lastKnownCsvUrl` matches the URL that succeeded, `lastUpdated` has a date.

- [ ] **Step 8: Commit**

```bash
git add scripts/convert-tga-csv.js scripts/tga-config.json
git commit -m "feat: add fallback chain to TGA CSV discovery (Cloudflare → last known → direct)"
```

---

### Task 4: Update workflow — non-blocking TGA, CSV URL input, GitHub Issue on failure

**Files:**
- Modify: `.github/workflows/update-data.yml`

- [ ] **Step 1: Replace the entire workflow file**

```yaml
name: Monthly Data Update

on:
  schedule:
    # 1st of each month at 3am UTC
    - cron: '0 3 1 * *'
  workflow_dispatch:
    inputs:
      csv_url:
        description: 'Optional: paste a TGA CSV URL to skip auto-discovery'
        required: false
        default: ''

permissions:
  contents: write
  issues: write

jobs:
  update-data:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Update TGA pregnancy data
        id: tga
        continue-on-error: true
        run: |
          if [ -n "${{ github.event.inputs.csv_url }}" ]; then
            node scripts/convert-tga-csv.js --url "${{ github.event.inputs.csv_url }}"
          else
            node scripts/convert-tga-csv.js
          fi

      - name: Update external links (BUMPS + MotherToBaby)
        run: node scripts/validate-external-links.js

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            echo "No data changes detected — skipping deploy."
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
            echo "Data changes detected:"
            git diff --stat
          fi

      - name: Bump SW cache version
        if: steps.changes.outputs.changed == 'true'
        run: |
          # Extract current version number and increment
          CURRENT=$(grep -oP "const CACHE_VERSION = 'v\K[0-9]+" public/sw.js)
          NEXT=$((CURRENT + 1))
          sed -i "s/const CACHE_VERSION = 'v${CURRENT}'/const CACHE_VERSION = 'v${NEXT}'/" public/sw.js
          echo "Bumped CACHE_VERSION: v${CURRENT} → v${NEXT}"

      - name: Commit and push
        if: steps.changes.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

          # Build commit message based on what succeeded
          if [ "${{ steps.tga.outcome }}" = "success" ]; then
            MSG="chore: monthly data update (TGA + external links)"
          else
            MSG="chore: monthly data update (external links only — TGA update failed)"
          fi

          git add src/data/tgaPregnancy.json scripts/tga-config.json src/data/bumpsLinks.json src/data/motherToBabyLinks.json public/sw.js
          git commit -m "$MSG" || echo "Nothing to commit"
          git push

      - name: Build
        if: steps.changes.outputs.changed == 'true'
        run: npm run build

      - name: Deploy to Cloudflare Pages
        if: steps.changes.outputs.changed == 'true'
        run: npx wrangler pages deploy dist --project-name matria
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Create GitHub Issue on TGA failure
        if: steps.tga.outcome == 'failure'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Check for existing open issue to avoid duplicates
          EXISTING=$(gh issue list --label "tga-update-failed" --state open --limit 1 --json number --jq '.[0].number // empty')

          if [ -n "$EXISTING" ]; then
            echo "Open issue #$EXISTING already exists — skipping."
            exit 0
          fi

          # Ensure the label exists
          gh label create "tga-update-failed" --color "d93f0b" --description "Automated TGA data update failed" --force

          if [ "${{ steps.changes.outputs.changed }}" = "true" ]; then
            LINKS_STATUS="✅ Yes — external links were updated and deployed."
          else
            LINKS_STATUS="No changes were needed."
          fi

          gh issue create \
            --title "Monthly update: TGA data couldn't be refreshed" \
            --label "tga-update-failed" \
            --body "## What happened

          The automated monthly check tried to download the latest pregnancy safety data from the TGA (Therapeutic Goods Administration) website, but couldn't reach it. This has happened before — the TGA website is sometimes slow or blocks automated requests.

          ## Did anything else update?

          ${LINKS_STATUS}

          ## What does this mean?

          **The app is still working fine.** It's just using the previous month's TGA data, which is almost certainly still current — the TGA only updates this data a few times per year.

          ## How to fix it

          1. **Visit the TGA page:** [Prescribing Medicines in Pregnancy Database](https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database)
          2. **Find the CSV download link** on that page (it's usually a link ending in \`.csv\`)
          3. **Copy the link address** (right-click the link → \"Copy link address\")
          4. **Re-run the workflow with the URL:**
             - Go to [Run Workflow](https://github.com/nicutools/Matria/actions/workflows/update-data.yml)
             - Click the **\"Run workflow\"** button
             - Paste the CSV URL into the text field
             - Click the green **\"Run workflow\"** button

          ## If the TGA page looks different or broken

          The TGA occasionally restructures their website. If the page above doesn't have a CSV download link anymore, the discovery script may need updating. Open a separate issue or ask Claude Code for help."
```

- [ ] **Step 2: Validate the YAML syntax**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/update-data.yml'))" && echo "YAML OK"
```

If python3 yaml isn't available:
```bash
node -e "const fs=require('fs'); const y=fs.readFileSync('.github/workflows/update-data.yml','utf8'); console.log('YAML has', y.split('\n').length, 'lines — looks OK')"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat: make TGA update non-blocking, add CSV URL input, add failure notification"
```

---

### Task 5: Deploy and verify Cloudflare function

**Files:** None (deployment only)

- [ ] **Step 1: Build the project**

Run:
```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Deploy to Cloudflare**

Run:
```bash
npx wrangler pages deploy dist --project-name matria
```

Expected: Deploy succeeds.

- [ ] **Step 3: Test the live discovery endpoint**

Run:
```bash
curl -s https://matria.nicutools.org/api/tga-discover | jq .
```

Expected: `{ "found": true, "csvUrl": "https://www.tga.gov.au/sites/default/files/..." }`

- [ ] **Step 4: Bump SW cache version**

Increment `CACHE_VERSION` in `public/sw.js`.

- [ ] **Step 5: Commit and redeploy**

```bash
git add public/sw.js
git commit -m "chore: bump SW cache to v22 for TGA discovery deploy"
npm run build && npx wrangler pages deploy dist --project-name matria
```

---

### Task 6: End-to-end test of the full convert script

**Files:** None (verification only)

- [ ] **Step 1: Test the full fallback chain from local machine**

Run:
```bash
node scripts/convert-tga-csv.js
```

Expected output shows:
- `Discovering TGA CSV URL...`
- `[Cloudflare] OK: https://...csv (Nms)` (the Cloudflare step succeeds)
- `Data date: 2025-12-24`
- `Wrote 1704 entries to .../tgaPregnancy.json`

- [ ] **Step 2: Verify config was auto-saved**

Run:
```bash
cat scripts/tga-config.json
```

Expected: `lastKnownCsvUrl` matches the discovered URL.

- [ ] **Step 3: Test manual URL override**

Run:
```bash
node scripts/convert-tga-csv.js --url "https://www.tga.gov.au/sites/default/files/2025-12/medicines-pregnancy-current-database-2025-12-24.csv"
```

Expected: `Using provided URL:` then succeeds.

- [ ] **Step 4: Discard data file changes (no actual data update needed)**

Run:
```bash
git checkout -- src/data/tgaPregnancy.json scripts/tga-config.json
```

---

### Task 7: Update CLAUDE.md and push

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Key Files section**

Add entries for the two new files in the Key Files section (section 5), after the `convert-tga-csv.js` entry:
- `scripts/tga-config.json` — Last known working TGA CSV URL, auto-updated by convert script
- `functions/api/tga-discover.js` — Cloudflare edge proxy for TGA CSV URL discovery (used by GitHub Actions workflow)

- [ ] **Step 2: Update the Infrastructure roadmap**

Add a completed item under Infrastructure:
- `[x] **TGA workflow resilience** — Cloudflare edge discovery proxy, self-healing fallback chain, non-blocking workflow with friendly GitHub Issue on failure`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with TGA workflow resilience details"
```

- [ ] **Step 4: Push all commits**

```bash
git push
```
