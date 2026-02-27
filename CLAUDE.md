# CLAUDE.md — Project: Matria

## 1. Vision & Strategy
**Purpose:** A mobile-first web app for looking up FDA pregnancy labeling for medications. Sister project to [Lactia](https://github.com/nicutools/LactMed) (breastfeeding safety).

**Target Users:** Parents and healthcare providers needing pregnancy-specific drug safety information.

**Data Source:** OpenFDA Drug Label API — structured JSON containing FDA-approved labeling, including pregnancy sections from Structured Product Labeling (SPL).

## 2. Technology Stack
- **Frontend:** React (Vite) + Tailwind CSS
- **Hosting:** Cloudflare Pages (static assets + Pages Functions)
- **Data Source:** OpenFDA Drug Label API (`api.fda.gov/drug/label.json`)
- **API Proxies:** Two Cloudflare Pages Functions proxy OpenFDA requests (CORS bypass + server-side filtering)
- **State Management:** React useState
- **Deploy:** `npm run build && npx wrangler pages deploy dist`
- **Local dev with functions:** `npm run build && npx wrangler pages dev dist`

## 3. Core Architecture

### A. Search Workflow (OpenFDA via Pages Function Proxy)
1. **User Input:** User enters a drug or brand name (e.g., "Sertraline" or "Zoloft").
2. **Brand Resolution:** `resolveBrand()` checks local `brandToGeneric.json` (~400 mappings), then RxNorm API fallback for international generics (paracetamol → acetaminophen). `<BrandBadge>` shows resolution context.
3. **Search Proxy:** `GET /api/search?drug_name={query}` — Cloudflare Pages Function at `functions/api/search.js`.
4. **Server-side logic:**
   - Queries OpenFDA: `openfda.generic_name:{q}+openfda.brand_name:{q}` (limit=100)
   - `+` is OpenFDA's AND operator — must NOT be URL-encoded
   - Multi-word queries use phrase matching with double quotes
   - **Exact-match filtering:** Only keeps labels where `stripSaltForm(generic_name)` exactly equals the query (prevents combo products like "Acetaminophen And Codeine" polluting results for "Acetaminophen")
   - Falls back to prefix match, then unfiltered if exact match removes everything
   - **Deduplication:** Groups by salt-stripped generic name, prefers labels with pregnancy data, then most recent `effective_time`
   - Merges brand names across grouped labels, strips salt forms from display titles
5. **Client-side:** `src/api/dailymed.js` (named for historical reasons) fetches `/api/search` and returns `{ results }`.
6. **Display:**
   - **Multiple results:** Compact title list. Tap to view full card. "All results" back button.
   - **Single result:** Full DrugCard shown directly.
   - 3-character minimum query length with 350ms debounce.

### B. Pregnancy Data (OpenFDA via Pages Function Proxy)
DrugCard has a "Show pregnancy details" button that lazy-loads full pregnancy labeling:
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

### C. Name Resolution (Brand + International Generic)
Same architecture as Lactia:
1. **Local brand mapping:** `src/data/brandToGeneric.json` (~400 AU/UK/US brand-to-generic mappings).
2. **RxNorm API fallback:** Resolves international generic names to US names (paracetamol → acetaminophen).
3. **Display:** `<BrandBadge>` shows "is a brand name for" or "is also known as".

### D. Salt Form Stripping
Both search and pregnancy endpoints strip common salt forms for matching and display:
`HYDROCHLORIDE, HCL, SULFATE, SODIUM, POTASSIUM, MESYLATE, MALEATE, FUMARATE, TARTRATE, BESYLATE, SUCCINATE, CITRATE, ACETATE, PHOSPHATE, BROMIDE, CHLORIDE, NITRATE, CALCIUM, MAGNESIUM, BITARTRATE`

## 4. Data Schema
| Field | Source | Description |
|:---|:---|:---|
| `title` | `openfda.generic_name[0]` (salt-stripped, title-cased) | Display name for the drug |
| `brandNames` | `openfda.brand_name[]` (merged, salt-stripped, deduped) | Known brand names |
| `effectiveTime` | `effective_time` (YYYYMMDD) | Label effective date |
| `riskSummary` | `pregnancy` / `teratogenic_effects` / `pregnancy_or_breast_feeding` | Risk overview |
| `clinicalConsiderations` | Subsection of `pregnancy` (PLLR only) | Disease/dose/labor considerations |
| `data` | Subsection of `pregnancy` (PLLR only) | Human and animal data |
| `pregnancyRegistry` | Subsection of `pregnancy` (PLLR only) | Exposure registry info |

## 5. Key Files
- `functions/api/search.js` — OpenFDA search proxy: exact-match filter, salt-strip dedup, brand merging
- `functions/api/pregnancy.js` — OpenFDA pregnancy data: 3-tier field fallback, subsection splitting
- `src/api/dailymed.js` — Client search wrapper (fetches `/api/search`)
- `src/api/pregnancy.js` — Client pregnancy wrapper (fetches `/api/pregnancy`)
- `src/api/brandResolver.js` — Brand + international name resolution
- `src/data/brandToGeneric.json` — Static brand-to-generic mappings (~400 entries)
- `src/components/DrugCard.jsx` — Pregnancy card with teal risk summary, accordion sections
- `src/components/HomePage.jsx` — Hero text, common drug pills, About section
- `src/components/Disclaimer.jsx` — FDA/DailyMed disclaimer footer
- `src/components/BrandBadge.jsx` — Brand/international name resolution badge
- `src/components/SearchBar.jsx` — Sticky frosted glass header with search input
- `src/components/ShareButton.jsx` — Native share / clipboard fallback
- `src/App.jsx` — Main app: search state, result list, selection, URL sync
- `src/main.jsx` — React entry + SW registration + cache warming
- `public/sw.js` — Service worker (cache-first static, network-first API)
- `public/manifest.json` — PWA manifest

## 6. PWA
- **Service Worker:** `public/sw.js` — hand-rolled, same pattern as Lactia
  - Static assets: cache-first (precached on install)
  - Google Fonts: cache-first at runtime
  - API routes (`/api/*`, `api.fda.gov`, `rxnav.nlm.nih.gov`): network-first with cache fallback
  - Bump `CACHE_VERSION` to invalidate caches on deploy
- **Cache warming:** `main.jsx` prefetches 8 common pregnancy drug searches 5s after first visit (1s gap). Skipped on deep links.
- **Manifest:** Standalone display, teal-600 theme (#0d9488)

## 7. Design System
Shared with Lactia:
- **Palette:** Teal accents (`teal-600/500/400`), slate neutrals, `sky-900` headings (light mode), Inter font
- **UI:** Frosted glass header (`backdrop-blur-md`), teal summary wash on DrugCard, 44px touch targets (`min-h-11`), `rounded-2xl` corners
- **Logo:** Placeholder (uses Lactia's `logo.png` for now)

## 8. Roadmap

### Polish & Completeness
- [ ] **Custom Matria logo** — Replace Lactia's placeholder `logo.png` with a bespoke Matria logo
- [ ] **Rename `src/api/dailymed.js`** → `src/api/search.js` to reflect that it calls OpenFDA, not DailyMed. Update imports in `App.jsx` and `main.jsx`
- [ ] **Init git repo** — `git init`, push to GitHub under nicutools org
- [ ] **Update manifest description** — `manifest.json` and `index.html` meta description still say "DailyMed database"; align with OpenFDA reality

### Features
- [ ] **Brand names on DrugCard** — Display `brandNames[]` (already returned by search proxy) as subtitle text or pill badges under the drug title, so users can confirm they found the right drug
- [ ] **Lactation cross-link** — Add a "View breastfeeding safety on Lactia" link on each DrugCard that deep-links to Lactia with the same generic name (e.g. `https://lactia.nicutools.org/?drug={genericName}`)
- [ ] **"No pregnancy data" indicator in multi-result list** — The search proxy already tracks whether labels have pregnancy data during dedup. Pass this through to the client and show a subtle badge or dimmed styling on results that lack pregnancy labeling, so users don't tap into dead ends
- [ ] **Recent searches** — Store last ~10 successful searches in `localStorage`. Display on HomePage below the popular drug pills (or replace them once user has history). Tap to re-search, with a clear button to reset. No backend needed

### Data Quality
- [ ] **Pregnancy category letter extraction** — For legacy (Tier 2) labels, parse the old A/B/C/D/X category letter from `teratogenic_effects` text and display it as a prominent badge on DrugCard
- [ ] **Better text formatting** — The raw PLLR text is often a single long block. Detect paragraph breaks, bullet points, and sub-headings in the labeling text and render with proper whitespace and structure

### Infrastructure
- [ ] **Custom domain** — Point a domain at the Cloudflare Pages deployment
- [ ] **Analytics** — Add privacy-respecting analytics (e.g. Cloudflare Web Analytics — single script tag, no cookies)
- [ ] **Error monitoring** — Surface API failures and edge cases in production

## 9. Development Rules for Claude Code
- **Atomic Components:** Keep UI logic separate from data fetching logic.
- **Mobile First:** All layouts optimized for single-hand iPhone use.
- **Safety:** Display the label effective date prominently on every drug card.
- **Disclaimer:** FDA/DailyMed disclaimer must be visible in footer of all results.
- **Deploy:** `npm run build && npx wrangler pages deploy dist`
- **Local dev with functions:** `npm run build && npx wrangler pages dev dist`
- **OpenFDA `+` operator:** Never URL-encode the `+` in OpenFDA search terms — it's the AND operator.
- **Exact-match filtering:** Always filter OpenFDA results by exact generic_name match (salt-stripped) to exclude combo products.
