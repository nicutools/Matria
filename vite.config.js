import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Exposed to the client so usage counters can report which build produced them.
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
