import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Where the app is mounted. The custom domain (sunetzu.com) serves Pages from
 * the domain root, so this is '/' — it was '/oll-trainer/' while the app lived
 * at <user>.github.io/<repo>/. Everything below derives from it, so moving the
 * app back under a path is a one-line change.
 */
const BASE_PATH = '/'

/** The trainer itself; '/' is the landing page. Must match the router. */
const TRAINER_PATH = '/oll-trainer'

/**
 * GitHub Pages has no SPA rewrite, so a hard refresh of any route below '/'
 * would 404. Two things stand in for a rewrite:
 *
 * - `404.html`, a copy of `index.html`. Pages serves it for any unmatched
 *   path, so the SPA boots and the router resolves the original URL. The app
 *   works, but the response carries a 404 status.
 * - `oll-trainer/index.html`, also a copy. Pages serves a directory's
 *   `index.html` with a real **200**, so the trainer's own entry point — which
 *   is the PWA `start_url`, and the URL people will bookmark and share — is a
 *   proper page rather than a dressed-up error.
 *
 * Deep links under it (`/oll-trainer/practice/train`) still fall to `404.html`.
 * They work, and nobody bookmarks a scramble. A host with real rewrites would
 * make both cases 200 and let all of this go.
 */
function spaFallbacks(): Plugin {
  const dist = (path: string) => fileURLToPath(new URL(`./dist/${path}`, import.meta.url))

  return {
    name: 'oll-trainer:spa-fallbacks',
    apply: 'build',
    closeBundle() {
      const index = dist('index.html')
      copyFileSync(index, dist('404.html'))

      const trainerDir = dist(TRAINER_PATH.replace(/^\//, ''))
      mkdirSync(trainerDir, { recursive: true })
      copyFileSync(index, join(trainerDir, 'index.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // No `includeAssets`: the workbox globPatterns below already match
      // everything in public/, so listing files here only double-counts them.
      // (The plugin still lists the manifest icons separately, so the build's
      // reported entry count stays a little above the 14 workbox stores.)
      manifest: {
        id: BASE_PATH,
        name: 'OLL Trainer',
        short_name: 'OLL Trainer',
        description: 'Practice all 57 OLL cases with adaptive scheduling.',
        // Straight into the trainer: an installed app should not open on the
        // landing page, which exists to pitch the app to people who do not
        // have it yet.
        start_url: TRAINER_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate entry: a launcher crops a maskable icon to its own shape,
          // so this one is full-bleed with the artwork inside the safe zone.
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        navigateFallback: `${BASE_PATH}index.html`,
      },
      devOptions: { enabled: false },
    }),
    spaFallbacks(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
