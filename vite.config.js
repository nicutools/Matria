import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Exposed to the client so usage counters can report which build produced them.
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Emits dist/data-status.json — a machine-readable statement of how current
// this deployment's bundled data is, read nightly by the analytics dashboard.
//
// Generated at build time from the data actually in the bundle, and served
// from the deployed site, so it reports what users are really getting rather
// than what CI believed it published. A build that succeeds but fails to
// deploy leaves this file stale, which is exactly the signal we want.
function dataStatus() {
  return {
    name: 'matria-data-status',
    apply: 'build',
    closeBundle() {
      const tga = JSON.parse(readFileSync('src/data/tgaPregnancy.json', 'utf8'))._meta

      const status = {
        app: 'matria',
        built: new Date().toISOString().slice(0, 10),
        sources: [
          {
            id: 'tga-pregnancy',
            label: 'Australian TGA — Prescribing Medicines in Pregnancy',
            kind: 'bundled',
            // The TGA's own publication date for this dataset.
            revised: tga.updated ?? null,
            // When our job last reached the TGA and confirmed this is current.
            synced: tga.checked ?? null,
            records: tga.count ?? null,
            // Refreshed monthly; flag if it hasn't synced in ~5 weeks.
            expectedSyncDays: 35,
          },
          {
            id: 'openfda-labels',
            label: 'US FDA — pregnancy labelling (openFDA)',
            kind: 'live',
            revised: null,
            synced: null,
            records: null,
            expectedSyncDays: null,
          },
        ],
      }

      writeFileSync('dist/data-status.json', JSON.stringify(status, null, 2) + '\n')
      console.log(`data-status.json: TGA revised ${status.sources[0].revised}, synced ${status.sources[0].synced}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dataStatus()],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
