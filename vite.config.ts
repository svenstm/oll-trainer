import { fileURLToPath, URL } from 'node:url'
import { copyFileSync } from 'node:fs'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Repo name — the app is served from https://<user>.github.io/<BASE_PATH>/ */
const BASE_PATH = '/oll-trainer/'

/**
 * GitHub Pages has no SPA rewrite, so a hard refresh of /practice/learn 404s.
 * Pages serves 404.html for any unmatched path; making it a copy of index.html
 * boots the SPA, and the router resolves the original URL client-side.
 */
function spaFallback404(): Plugin {
  return {
    name: 'oll-trainer:spa-fallback-404',
    apply: 'build',
    closeBundle() {
      copyFileSync(
        fileURLToPath(new URL('./dist/index.html', import.meta.url)),
        fileURLToPath(new URL('./dist/404.html', import.meta.url)),
      )
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
        start_url: BASE_PATH,
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
    spaFallback404(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
