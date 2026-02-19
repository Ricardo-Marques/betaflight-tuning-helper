import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { changelogPlugin } from './vite-plugins/changelogPlugin'

// GitHub Pages deploys to /<repo-name>/, so we need a base path.
// GITHUB_REPOSITORY is "owner/repo" — extract the repo name.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repo ? `/${repo}/` : '/'

export default defineConfig({
  base,
  plugins: [
    changelogPlugin(),
    react({
      jsxImportSource: '@emotion/react',
    }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Betaflight Tuning Helper',
        short_name: 'BF Tuner',
        display: 'standalone',
        theme_color: '#1f2937',
        background_color: '#111827',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  worker: {
    format: 'es'
  },
  test: {
    include: ['src/**/*.test.ts'],
  }
})
