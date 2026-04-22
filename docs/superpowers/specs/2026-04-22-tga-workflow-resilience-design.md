# TGA Workflow Resilience Design

**Date:** 2026-04-22
**Status:** Approved
**Problem:** The monthly GitHub Actions workflow (`update-data.yml`) has failed for 2 consecutive months (March + April 2026) because the TGA pregnancy database page is unreachable from GitHub's datacenter IPs. This blocks the entire workflow — external link validation never runs either, and there's no notification.

## Root Cause

The `convert-tga-csv.js` script scrapes the TGA website to discover the CSV download URL. GitHub Actions runners use datacenter IPs (US-based) which Australian government sites commonly block, throttle, or deprioritise. The script sends no User-Agent header, making it look like a bot. Locally the same script works in under a second.

## Design

### 1. Cloudflare Discovery Function

**New file:** `functions/api/tga-discover.js`

A Cloudflare Pages Function that acts as a proxy for TGA page discovery:
- Fetches `https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database` with browser-like headers (`User-Agent`, `Accept: text/html`)
- Scrapes the HTML for the first `.csv` download link (same regex as current script)
- Returns JSON: `{ "csvUrl": "https://...", "found": true }` or `{ "found": false, "error": "..." }`
- Only called by the GitHub Actions workflow, not by app users
- No KV bindings or other infrastructure needed
- Runs on Cloudflare's edge network (Australian nodes available), avoiding datacenter IP blocking

### 2. Self-Healing Fallback Chain in `convert-tga-csv.js`

The script's discovery logic is replaced with a multi-step fallback chain. Each step is tried in order; the first success wins.

**Discovery order:**

1. **`--url` flag** — manual override, used as-is (no discovery needed)
2. **Cloudflare discovery** — `GET https://matria.nicutools.org/api/tga-discover` returns the CSV URL via edge network
3. **Last known URL** — read `scripts/tga-config.json`, HEAD request to verify the URL still returns 200
4. **Direct TGA scraping** — current logic as last resort, with browser-like headers (`User-Agent`, `Accept`) and 90s timeout
5. **Fail with diagnostics** — log HTTP status codes and timings for each step that failed, then `process.exit(1)`

**Auto-updating config:** Whenever any step succeeds, the working CSV URL and date are saved back to `scripts/tga-config.json` so the fallback stays current.

**New file:** `scripts/tga-config.json`
```json
{
  "lastKnownCsvUrl": "https://www.tga.gov.au/sites/default/files/2025-12/medicines-pregnancy-current-database-2025-12-24.csv",
  "lastUpdated": "2025-12-24"
}
```

### 3. Workflow Changes (`update-data.yml`)

#### 3a. TGA Step Becomes Non-Blocking

The TGA update step uses `continue-on-error: true`. A step output flag (`tga_ok`) tracks whether it succeeded. External link validation always runs regardless of TGA outcome. The commit message reflects what actually updated.

#### 3b. Manual Trigger Gets CSV URL Input

`workflow_dispatch` gains an optional `csv_url` input. When you click "Run workflow" in GitHub, there's a text field where you can paste a CSV URL. Passed to the script as `--url`. Left blank for normal auto-discovery runs.

#### 3c. GitHub Issue on TGA Failure

If the TGA step fails, a final workflow step auto-creates a GitHub Issue. The issue is written in plain, non-technical English:

**Title:** "Monthly update: TGA data couldn't be refreshed"

**Body includes:**
- What happened — the automated monthly check couldn't reach the TGA website to download the latest pregnancy data
- What still worked — whether external links (BUMPS + MotherToBaby) were updated successfully
- What this means — the app still works fine, it's just using the previous month's TGA data (which is almost certainly still current since TGA only updates a few times a year)
- How to fix it — step-by-step instructions:
  1. Visit the TGA page (direct link provided)
  2. Find and copy the CSV download link
  3. Go to the workflow page (direct link provided)
  4. Click "Run workflow", paste the URL, and click the green button
- A note that if the TGA page itself looks different or broken, the script may need updating (tag @nicutools or open a separate issue)

**Duplicate prevention:** The step checks for an existing open issue with a matching title label before creating a new one. Won't spam you if the same failure recurs.

### 4. What Doesn't Change

- CSV parsing logic
- External links validation script (`validate-external-links.js`)
- Build and deploy steps
- SW cache bump logic
- How TGA data is used in the app
- The `--url` manual override (still works, now also updates `tga-config.json`)

## Files Changed

| File | Change |
|:---|:---|
| `functions/api/tga-discover.js` | **New** — Cloudflare edge discovery proxy |
| `scripts/tga-config.json` | **New** — last known working CSV URL |
| `scripts/convert-tga-csv.js` | **Modified** — fallback chain, browser headers, auto-save config, better diagnostics |
| `.github/workflows/update-data.yml` | **Modified** — non-blocking TGA, `csv_url` input, GitHub Issue on failure |
