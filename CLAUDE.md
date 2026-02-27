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
- **API Proxies:** Two Cloudflare Pages Functions proxy OpenFDA requests (CORS bypass + server-side filtering)
- **State Management:** React useState
- **Deploy:** `npm run build && npx wrangler pages deploy dist --project-name matria`
- **Local dev with functions:** `npm run build && npx wrangler pages dev dist`
- **Version:** 1.0.0
- **Repo:** https://github.com/nicutools/Matria
- **Live:** https://matria.pages.dev

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

### B. TGA Pregnancy Categories (Static, Instant)
Shown immediately on every DrugCard without any API call:
1. **Data:** `src/data/tgaPregnancy.json` — 1,704 drugs with category + safety statement, generated from TGA CSV.
2. **Lookup:** `src/api/tgaLookup.js` — tries drug name as-is, then US→AU name fallback (acetaminophen→paracetamol, albuterol→salbutamol, etc.).
3. **Display:** `TGACategoryBadge` — colour-coded wash (green/amber/orange/red) with category letter, description, and safety statement all visible without tapping.
4. **Update:** Run `node scripts/convert-tga-csv.js` when TGA publishes updated CSV (a few times per year).

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
Same architecture as Lactia:
1. **Local brand mapping:** `src/data/brandToGeneric.json` (~400 AU/UK/US brand-to-generic mappings).
2. **RxNorm API fallback:** Resolves international generic names to US names (paracetamol → acetaminophen).
3. **Display:** `<BrandBadge>` shows "is a brand name for" or "is also known as".

### F. Salt Form Stripping
Both search and pregnancy endpoints strip common salt forms for matching and display:
`HYDROCHLORIDE, HCL, SULFATE, SODIUM, POTASSIUM, MESYLATE, MALEATE, FUMARATE, TARTRATE, BESYLATE, SUCCINATE, CITRATE, ACETATE, PHOSPHATE, BROMIDE, CHLORIDE, NITRATE, CALCIUM, MAGNESIUM, BITARTRATE`

## 4. Data Schema

### Search Result (from OpenFDA proxy)
| Field | Source | Description |
|:---|:---|:---|
| `title` | `openfda.generic_name[0]` (salt-stripped, title-cased) | Display name for the drug |
| `brandNames` | `openfda.brand_name[]` (merged, salt-stripped, deduped) | Known brand names |
| `effectiveTime` | `effective_time` (YYYYMMDD) | Label effective date |

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
- `scripts/convert-tga-csv.js` — Downloads TGA CSV, converts to JSON (run manually when TGA updates)
- `src/data/tgaPregnancy.json` — Static TGA pregnancy data (1,704 drugs, ~250KB)
- `src/api/tgaLookup.js` — TGA lookup with US→AU name fallback
- `src/data/brandToGeneric.json` — Static brand-to-generic mappings (~400 entries)
- `src/api/brandResolver.js` — Brand + international name resolution
- `src/api/dailymed.js` — Client search wrapper (fetches `/api/search`; name is historical)
- `src/api/pregnancy.js` — Client pregnancy wrapper (fetches `/api/pregnancy`)
- `functions/api/search.js` — OpenFDA search proxy: exact-match filter, salt-strip dedup, brand merging
- `functions/api/pregnancy.js` — OpenFDA pregnancy data: 3-tier field fallback, subsection splitting
- `src/components/DrugCard.jsx` — Main card: TGA badge (immediate) + FDA labeling (on demand) + external links
- `src/components/TGACategoryBadge.jsx` — Colour-coded TGA category with description and safety statement
- `scripts/validate-external-links.js` — Scrapes BUMPS + MotherToBaby index pages, writes verified slug JSON
- `src/data/bumpsLinks.json` — Verified BUMPS leaflet slugs (~350), generated by validation script
- `src/data/motherToBabyLinks.json` — Verified MotherToBaby fact sheet slugs (~320), generated by validation script
- `src/components/ExternalLinks.jsx` — BUMPS (UK) + MotherToBaby (US) outbound links (only verified)
- `src/components/HomePage.jsx` — Hero text, common drug pills, About section (credits TGA + FDA)
- `src/components/Disclaimer.jsx` — TGA + FDA disclaimer footer
- `src/components/BrandBadge.jsx` — Brand/international name resolution badge
- `src/components/SearchBar.jsx` — Sticky frosted glass header with Matria logo + search input
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
  - **Bump `CACHE_VERSION` on every deploy** to invalidate caches (currently `v5`)
- **Cache warming:** `main.jsx` prefetches 8 common pregnancy drug searches 5s after first visit (1s gap). Skipped on deep links.
- **Manifest:** Standalone display, teal-600 theme (#0d9488)
- **Icons:** Custom Matria branding — pregnant woman silhouette icon (192, 512, apple-touch-icon sizes) + logo with text for header

## 7. Design System
Shared with Lactia:
- **Palette:** Teal accents (`teal-600/500/400`), slate neutrals, `sky-900` headings (light mode), Inter font
- **UI:** Frosted glass header (`backdrop-blur-md`), 44px touch targets (`min-h-11`), `rounded-2xl` corners
- **TGA badge colours:** Emerald (A), Amber (B1-B3), Orange (C), Red (D/X)
- **Logo:** Custom Matria logo (`matriaLogo.png` source) and icon (`matriaIcon.png` source)

## 8. DrugCard Rendering Order
1. Drug title + FDA label effective date
2. **TGA Category Badge** (immediate, no API call) — colour-coded wash with category letter, description, safety statement, TGA attribution
3. **"Show FDA pregnancy labeling" button** (triggers API call)
4. **FDA Labeling section** (on demand) — "US FDA Labeling" header, Risk Summary, accordion sections (Clinical Considerations, Data, Pregnancy Exposure Registry)
5. **External Links** — BUMPS (UK) + MotherToBaby (US) patient information leaflets
6. **Share button**

## 9. Roadmap

### Polish & Completeness
- [ ] **Rename `src/api/dailymed.js`** → `src/api/search.js` to reflect that it calls OpenFDA, not DailyMed. Update imports in `App.jsx` and `main.jsx`

### Features
- [ ] **Brand names on DrugCard** — Display `brandNames[]` (already returned by search proxy) as subtitle text or pill badges under the drug title, so users can confirm they found the right drug
- [ ] **Lactation cross-link** — Add a "View breastfeeding safety on Lactia" link on each DrugCard that deep-links to Lactia with the same generic name (e.g. `https://lactia.nicutools.org/?drug={genericName}`)
- [ ] **"No pregnancy data" indicator in multi-result list** — The search proxy already tracks whether labels have pregnancy data during dedup. Pass this through to the client and show a subtle badge or dimmed styling on results that lack pregnancy labeling, so users don't tap into dead ends
- [ ] **Recent searches** — Store last ~10 successful searches in `localStorage`. Display on HomePage below the popular drug pills (or replace them once user has history). Tap to re-search, with a clear button to reset. No backend needed

### Data Quality
- [ ] **Better text formatting** — The raw PLLR text is often a single long block. Detect paragraph breaks, bullet points, and sub-headings in the labeling text and render with proper whitespace and structure

### Infrastructure
- [ ] **Automated TGA data updates** — Add a GitHub Actions scheduled workflow (monthly cron) that runs `node scripts/convert-tga-csv.js`, and if `tgaPregnancy.json` changed, commits it, builds, and deploys to Cloudflare Pages. Requires adding `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets. The conversion script already auto-discovers the latest CSV URL from the TGA website, so no code changes are needed between TGA updates.
- [ ] **Automated external link validation** — Add `node scripts/validate-external-links.js` to the same GitHub Actions workflow (or a separate monthly cron). If `bumpsLinks.json` or `motherToBabyLinks.json` changed, commit, build, and deploy. Picks up new leaflets as either site adds them.
- [ ] **Custom domain** — Point a domain at the Cloudflare Pages deployment
- [ ] **Analytics** — Add privacy-respecting analytics (e.g. Cloudflare Web Analytics — single script tag, no cookies)
- [ ] **Error monitoring** — Surface API failures and edge cases in production

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
