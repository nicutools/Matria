# CLAUDE.md — Project: Matria

## 1. Vision & Strategy
**Purpose:** A mobile-first web app for looking up pregnancy safety information for medications, combining Australian TGA pregnancy categories with US FDA labeling. Sister project to [Lactia](https://github.com/nicutools/LactMed) (breastfeeding safety).

**Target Users:** Australian parents and healthcare providers needing pregnancy-specific drug safety information.

**CRITICAL — Accuracy & Currency:** This app provides health information that directly affects clinical decisions for pregnant women and their unborn children. Inaccurate, outdated, or fabricated information can cause real harm. Every piece of data shown to users must be traceable to an authoritative source (TGA, FDA). Never invent, guess, or hallucinate drug safety data. Never hard-code safety statements or category ratings in UI code — always source them from the TGA database or FDA API. When in doubt, show nothing rather than show something wrong. Display dates and source attribution so users can assess currency themselves.

**Data Sources:**
- **Australian TGA** — Pregnancy categories (A/B1/B2/B3/C/D/X) and safety statements for 1,704 drugs. Static JSON bundled in the app, updated by running `node scripts/convert-tga-csv.js` when TGA publishes new data.
- **OpenFDA Drug Label API** — Detailed US FDA pregnancy labeling (PLLR Section 8.1) fetched on demand via Pages Function proxies.

## 2. Technology Stack
- **Frontend:** React (Vite) + Tailwind CSS
- **Hosting:** Cloudflare Pages (static assets + Pages Functions)
- **Data Sources:** TGA (static JSON) + OpenFDA API (`api.fda.gov/drug/label.json`)
- **API Proxies:** Three Cloudflare Pages Functions — two proxy OpenFDA requests (CORS bypass + server-side filtering), one records search analytics to KV
- **Search Analytics:** Cloudflare Workers KV (`SEARCH_COUNTS` binding) — fire-and-forget drug view counting via `/api/count`
- **State Management:** React useState
- **Error Monitoring:** Sentry (`@sentry/react`) — captures unhandled errors + FDA API failures, privacy-safe (drug names stripped from URLs/breadcrumbs)
- **Deploy:** `npm run build && npx wrangler pages deploy dist --project-name matria`
- **Local dev with functions:** `npm run build && npx wrangler pages dev dist`
- **Version:** 1.0.1
- **Repo:** https://github.com/nicutools/Matria
- **Live:** https://matria.nicutools.org (custom domain) / https://matria.pages.dev
- **Analytics:** Google Analytics GA4 — `G-4R6SD5H388` (gtag in `index.html`)

## 3. Core Architecture

### A. Search Workflow (TGA-Primary, FDA Fallback)
TGA is the primary search source — results are instant with no API call. FDA is a fallback for drugs not in the TGA database.

1. **User Input:** User enters a drug or brand name (e.g., "Sertraline" or "Zoloft").
2. **Local Brand Resolution (sync):** `resolveLocalBrand()` checks `brandToGeneric.json` (~400 mappings). No network call. `<BrandBadge>` shows resolution context.
3. **TGA Search (sync, instant):** `searchTGA()` in `src/api/tgaSearch.js` searches the bundled TGA database:
   - Resolves brand names via `brandToGeneric.json`
   - Applies US→AU name mapping (acetaminophen→paracetamol, albuterol→salbutamol, etc.)
   - Matching: exact match → prefix match for drug families (e.g., "insulin" → insulin aspart, insulin glargine, etc.) → `startsWith` match (e.g., "sertra" → "sertraline") → `contains` match for mid-name lookups (e.g., "valproate" → "sodium valproate (valproic acid)")
   - Builds brand name list from reverse lookup of `brandToGeneric.json`
   - Sets `fdaName` when AU/US names differ (so DrugCard knows what name to send to the FDA API)
   - Returns: `[{ title, tgaName, category, statement, brandNames, fdaName?, source: 'tga' }]`
   - **No loading spinner** — results appear instantly as the user types
4. **FDA Fallback (async, debounced):** If TGA returns 0 results, falls through to OpenFDA search after 350ms debounce:
   - `resolveBrand()` with RxNorm API for international names
   - `searchDrugs()` → `/api/search` OpenFDA proxy (same as before)
   - Returns: `[{ title, brandNames, effectiveTime, hasPregnancyData, source: 'fda' }]`
5. **Display:**
   - **Multiple results:** Compact list with TGA category badges inline. Tap to view full card.
   - **Single result:** Full DrugCard shown directly.
   - 3-character minimum query length. No debounce for TGA; 350ms debounce for FDA fallback.
   - **Recent searches:** Debounced (1s) to prevent duplicate entries while typing.

### B. TGA Pregnancy Categories (Static, Instant)
TGA data is the primary data source — embedded directly in search results:
1. **Data:** `src/data/tgaPregnancy.json` — ~1,700 drugs with category + safety statement, generated from TGA CSV.
2. **Search:** `src/api/tgaSearch.js` — primary search module. Searches TGA keys with brand + US→AU resolution.
3. **Lookup (for FDA fallback):** `src/api/tgaLookup.js` — used by DrugCard when displaying FDA-sourced results. Tries exact match, US→AU name fallback, then prefix match for drug families.
4. **Display:** `TGACategoryBadge` — colour-coded wash (green/amber/orange/red) with category letter, description, and safety statement all visible without tapping.
5. **Update:** Run `node scripts/convert-tga-csv.js` when TGA publishes updated CSV (a few times per year).

### C. FDA Pregnancy Labeling (OpenFDA via Pages Function Proxy)
Secondary to TGA, loaded on demand via "Show FDA pregnancy labeling" button:
1. **Endpoint:** `GET /api/pregnancy?name={genericName}` — Cloudflare Pages Function at `functions/api/pregnancy.js`.
2. **Three-tier pregnancy field fallback:**
   - **Tier 1 (score 3):** `pregnancy` field — new PLLR format (Section 8.1, LOINC 42228-7). Split into subsections.
   - **Tier 2 (score 2):** `teratogenic_effects` field — old Pregnancy Category format. Returned as `riskSummary` with `format: 'legacy'`.
   - **Tier 3 (score 1):** `pregnancy_or_breast_feeding` field — OTC brief warning. Returned as `riskSummary` with `format: 'otc'`.
3. **Subsection splitting (PLLR format):** Regex-splits full Section 8.1 text by heading patterns:
   - "Pregnancy Exposure Registry" → `pregnancyRegistry`
   - "Risk Summary" → `riskSummary`
   - "Clinical Considerations" → `clinicalConsiderations`
   - "Data" → `data`
4. **Exact-match filtering:** Same `stripSalt()` logic as search — only uses labels where generic_name exactly matches the query.
5. **Caching:** `Cache-Control: public, max-age=86400` (24h CDN cache).
6. **Display:** Grouped under "US FDA Labeling" header with Risk Summary, then accordion sections for Clinical Considerations, Data, and Pregnancy Exposure Registry.

### D. External Patient Information Links
`ExternalLinks` component at bottom of DrugCard. Links are only shown for drugs with verified leaflets — no optimistic/404-prone links.
- **BUMPS (UK):** Links to `medicinesinpregnancy.org/leaflets-a-z/{slug}/` using INN/AU drug names. Verified against `bumpsLinks.json` (~350 slugs scraped from BUMPS index).
- **MotherToBaby (US):** Links to `mothertobaby.org/fact-sheets/{slug}/`. Verified against `motherToBabyLinks.json` (~320 slugs scraped from MotherToBaby index). Slugs often include suffixes (e.g. `acetaminophen-pregnancy`, `sertraline-zoloft-pregnancy`), matched via startsWith.
- **Validation script:** `node scripts/validate-external-links.js` scrapes both sites' index pages and regenerates the JSON files. Run periodically to pick up new leaflets.
- If neither link is verified for a drug, the section is hidden entirely.

### E. Name Resolution (Brand + International Generic)
Two-tier brand resolution in `src/api/brandResolver.js`:
1. **`resolveLocalBrand()` (sync):** Checks `brandToGeneric.json` (~400 AU/UK/US brand-to-generic mappings). Used by TGA-primary search path for instant results.
2. **`resolveBrand()` (async):** Same local check + RxNorm API fallback for international generics (paracetamol → acetaminophen). Used by FDA fallback path. RxNorm results are skipped if the returned name starts with the original query (prevents name-mangling like "insulin" → "insulin, regular, human").
3. **Display:** `<BrandBadge>` shows "is a brand name for" or "is also known as".

### F. Salt Form Stripping
Both search and pregnancy endpoints strip common salt forms for matching and display:
`HYDROCHLORIDE, HCL, SULFATE, SODIUM, POTASSIUM, MESYLATE, MALEATE, FUMARATE, TARTRATE, BESYLATE, SUCCINATE, CITRATE, ACETATE, PHOSPHATE, BROMIDE, CHLORIDE, NITRATE, CALCIUM, MAGNESIUM, BITARTRATE`

## 4. Data Schema

### Search Result — TGA Primary (from `searchTGA()`)
| Field | Source | Description |
|:---|:---|:---|
| `title` | TGA key (title-cased) | Display name for the drug |
| `tgaName` | TGA key (lowercase) | TGA database key |
| `category` | TGA data | A, B1, B2, B3, C, D, or X |
| `statement` | TGA data | Safety statement (if available) |
| `brandNames` | Reverse lookup from `brandToGeneric.json` | Known brand names |
| `fdaName` | AU→US reverse map | US generic name for FDA API (null if same as AU) |
| `source` | `'tga'` | Identifies result origin |

### Search Result — FDA Fallback (from OpenFDA proxy)
| Field | Source | Description |
|:---|:---|:---|
| `title` | `openfda.generic_name[0]` (salt-stripped, title-cased) | Display name for the drug |
| `brandNames` | `openfda.brand_name[]` (merged, salt-stripped, deduped) | Known brand names |
| `effectiveTime` | `effective_time` (YYYYMMDD) | Label effective date |
| `source` | `'fda'` | Identifies result origin |

### TGA Data (static JSON)
| Field | Source | Description |
|:---|:---|:---|
| `category` | TGA CSV | A, B1, B2, B3, C, D, or X |
| `statement` | TGA CSV | Safety statement (740 of 1,704 drugs have one) |

### FDA Pregnancy Data (from OpenFDA proxy)
| Field | Source | Description |
|:---|:---|:---|
| `riskSummary` | `pregnancy` / `teratogenic_effects` / `pregnancy_or_breast_feeding` | Risk overview |
| `clinicalConsiderations` | Subsection of `pregnancy` (PLLR only) | Disease/dose/labor considerations |
| `data` | Subsection of `pregnancy` (PLLR only) | Human and animal data |
| `pregnancyRegistry` | Subsection of `pregnancy` (PLLR only) | Exposure registry info |

## 5. Key Files
- `scripts/convert-tga-csv.js` — Downloads TGA CSV, converts to JSON. Uses fallback chain: Cloudflare proxy → last known URL → direct TGA scrape
- `scripts/tga-config.json` — Last known working TGA CSV URL, auto-updated by convert script on success
- `src/data/tgaPregnancy.json` — Static TGA pregnancy data (1,704 drugs, ~250KB)
- `src/api/tgaSearch.js` — **Primary search module**: searches TGA data locally with brand + US→AU resolution
- `src/api/tgaLookup.js` — TGA lookup with US→AU name fallback + prefix matching (used by DrugCard for FDA-fallback results)
- `src/data/brandToGeneric.json` — Static brand-to-generic mappings (~400 entries)
- `src/api/brandResolver.js` — `resolveLocalBrand()` (sync) + `resolveBrand()` (async with RxNorm)
- `src/api/search.js` — Client search wrapper for FDA fallback (fetches `/api/search`)
- `src/api/pregnancy.js` — Client pregnancy wrapper (fetches `/api/pregnancy`)
- `functions/api/search.js` — OpenFDA search proxy (FDA fallback): exact-match filter, salt-strip dedup, brand merging
- `functions/api/pregnancy.js` — OpenFDA pregnancy data: 3-tier field fallback, subsection splitting, sub-heading insertion
- `functions/api/count.js` — KV search analytics: fire-and-forget drug view counter (`SEARCH_COUNTS` binding)
- `functions/api/tga-discover.js` — Cloudflare edge proxy for TGA CSV URL discovery (used by GitHub Actions workflow; currently blocked by Akamai WAF)
- `src/components/DrugCard.jsx` — Main card: TGA badge (immediate) + FDA labeling (on demand) + external links
- `src/components/TGACategoryBadge.jsx` — Colour-coded TGA category with description and safety statement
- `scripts/validate-external-links.js` — Scrapes BUMPS + MotherToBaby index pages, writes verified slug JSON
- `src/data/bumpsLinks.json` — Verified BUMPS leaflet slugs (~350), generated by validation script
- `src/data/motherToBabyLinks.json` — Verified MotherToBaby fact sheet slugs (~320), generated by validation script
- `src/components/FormattedText.jsx` — Structured text rendering: paragraphs, bold sub-headings, bullet lists, word-break for URLs
- `src/components/ExternalLinks.jsx` — BUMPS (UK) + MotherToBaby (US) outbound links (only verified) + Lactia cross-link
- `src/components/HomePage.jsx` — Hero text, common drug pills, About section (credits TGA + FDA)
- `src/components/Disclaimer.jsx` — TGA + FDA disclaimer footer
- `src/components/BrandBadge.jsx` — Brand/international name resolution badge
- `src/components/SearchBar.jsx` — Sticky frosted glass header with Matria logo + search input + sister site nav (Lactia, nicutools)
- `src/components/ShareButton.jsx` — Native share / clipboard fallback
- `src/App.jsx` — Main app: TGA-primary search with FDA fallback, result list with category badges, selection, URL sync
- `src/main.jsx` — React entry + SW registration + cache warming
- `public/sw.js` — Service worker (cache-first static, network-first API)
- `public/manifest.json` — PWA manifest

## 6. PWA
- **Service Worker:** `public/sw.js` — hand-rolled, same pattern as Lactia
  - Static assets: cache-first (precached on install)
  - Google Fonts: cache-first at runtime
  - API routes (`/api/*`, `api.fda.gov`, `rxnav.nlm.nih.gov`): network-first with cache fallback
  - `/api/count`: bypassed entirely (fire-and-forget analytics, no caching)
  - **Bump `CACHE_VERSION` on every deploy** to invalidate caches (currently `v20`)
- **Cache warming:** `main.jsx` prefetches FDA pregnancy data for 8 common drugs 5s after first visit (1s gap). TGA search is instant (local) so doesn't need warming. Skipped on deep links.
- **Manifest:** Standalone display, teal-600 theme (#0d9488)
- **Icons:** Custom Matria branding — pregnant woman silhouette icon (192, 512, apple-touch-icon sizes) + logo with text for header

## 7. Design System
Shared with Lactia:
- **Palette:** Teal accents (`teal-600/500/400`), slate neutrals, `sky-900` headings (light mode), Inter font
- **UI:** Frosted glass header (`backdrop-blur-md`), 44px touch targets (`min-h-11`), `rounded-2xl` corners
- **TGA badge colours:** Emerald (A), Amber (B1-B3), Orange (C), Red (D/X)
- **Logo:** Custom Matria logo (`matriaLogo.png` source) and icon (`matriaIcon.png` source). Separate dark mode logo (`public/logo-dark.png`) with white text and preserved terracotta silhouette.

## 8. DrugCard Rendering Order
1. Drug title + brand names subtitle
2. **TGA Category Badge** (immediate — embedded in TGA search results, or looked up for FDA-fallback results) — colour-coded wash with category letter, description, safety statement, TGA attribution
3. **"Show FDA pregnancy labeling" button** (triggers API call, uses `fdaName` or `tgaName` for query)
4. **FDA Labeling section** (on demand) — "US FDA Labeling" header, Risk Summary, accordion sections (Clinical Considerations, Data, Pregnancy Exposure Registry)
5. **External Links** — BUMPS (UK) + MotherToBaby (US) patient information leaflets
6. **Share button**

## 9. Roadmap

### Polish & Completeness
- [x] **Rename `src/api/dailymed.js`** → `src/api/search.js` to reflect that it calls OpenFDA, not DailyMed. Update imports in `App.jsx` and `main.jsx`

### Features
- [x] **Brand names on DrugCard** — Display `brandNames[]` as subtitle text under the drug title ("Also sold as ...")
- [x] **Lactation cross-link** — "Breastfeeding safety on Lactia" link in ExternalLinks, deep-links to `https://lactia.nicutools.org/?drug={genericName}`
- [x] **"No pregnancy data" indicator in multi-result list** — Search proxy passes `hasPregnancyData` to client. Results without FDA data are dimmed with "No FDA data" badge.
- [x] **Recent searches** — Last 10 successful searches stored in `localStorage`. Shown on HomePage above common searches with teal ring styling and clear button.

### Architecture
- [x] **TGA-primary search** — Search uses the bundled TGA database as the primary source (instant, no API call). OpenFDA search is a fallback for drugs not in TGA. Drug families (insulin, iron, etc.) show all formulations with inline category badges. Recent search saving debounced to prevent duplicate entries.

### Data Quality
- [x] **Better text formatting** — `cleanHtml()` in pregnancy proxy preserves newlines from block HTML elements. `insertSubHeadings()` adds line breaks before known PLLR sub-headings (Human Data, Animal Data, Maternal Adverse Reactions, etc.). `FormattedText` component renders paragraphs, bold sub-headings, and bullet lists.

### Infrastructure
- [x] **Automated TGA data updates + external link validation** — `.github/workflows/update-data.yml` runs monthly (1st at 3am UTC) + manual `workflow_dispatch`. Runs both `convert-tga-csv.js` and `validate-external-links.js`, bumps SW cache version, commits, builds, and deploys if data changed.
- [x] **GitHub Actions secrets** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` added to GitHub repo secrets.
- [x] **Custom domain** — `matria.nicutools.org` via Cloudflare DNS CNAME
- [x] **Analytics** — Google Analytics GA4 (`G-4R6SD5H388`) via gtag snippet in `index.html`
- [x] **Error monitoring** — Sentry (`@sentry/react`) captures unhandled errors + FDA API failures. Privacy-safe: drug names stripped from URLs and breadcrumbs. ErrorBoundary fallback UI wraps app.
- [x] **Search analytics** — KV-based drug view frequency tracking via `/api/count` endpoint. `SEARCH_COUNTS` KV namespace bound in CF dashboard. Logs all drug views (TGA + FDA) fire-and-forget from client.
- [x] **Sentry alert rules** — Configure email alert in Sentry UI (Alerts → Create Rule → "When a new issue is created, send email")
- [x] **TGA workflow resilience** — Self-healing fallback chain (Cloudflare proxy → last known URL → direct scrape), non-blocking workflow with friendly GitHub Issue on failure, manual CSV URL input for recovery

## 10. Development Rules for Claude Code

### Data Integrity (HIGHEST PRIORITY)
- **Never fabricate health data.** All drug safety information must come from the TGA database (`tgaPregnancy.json`) or the FDA API. Never hard-code, guess, or invent pregnancy categories, safety statements, or risk summaries.
- **Never suppress or alter source data.** Display TGA and FDA text exactly as provided. Do not paraphrase, simplify, or editorialize safety information.
- **Show provenance.** Every piece of safety data must have visible source attribution (e.g., "Source: Australian TGA") so users can verify it.
- **Show dates.** Always display the FDA label effective date so users can assess how current the information is.
- **Prefer nothing over wrong.** If data is unavailable or uncertain, show "No data available" — never fill gaps with assumptions.
- **Keep TGA data current.** Run `node scripts/convert-tga-csv.js` when TGA publishes updated CSV data (a few times per year). The `_meta.updated` field in `tgaPregnancy.json` tracks the data vintage.

### Architecture & UI
- **Atomic Components:** Keep UI logic separate from data fetching logic.
- **Mobile First:** All layouts optimized for single-hand iPhone use.
- **TGA First:** TGA data is primary (instant, static). FDA data is secondary (on demand).
- **Disclaimer:** TGA + FDA disclaimer must be visible in footer of all results.

### Deploy & Operations
- **Deploy:** `npm run build && npx wrangler pages deploy dist --project-name matria`
- **Local dev with functions:** `npm run build && npx wrangler pages dev dist`
- **Bump SW cache:** Increment `CACHE_VERSION` in `public/sw.js` on every deploy to avoid stale cache issues.
- **OpenFDA `+` operator:** Never URL-encode the `+` in OpenFDA search terms — it's the AND operator.
- **Exact-match filtering:** Always filter OpenFDA results by exact generic_name match (salt-stripped) to exclude combo products.
