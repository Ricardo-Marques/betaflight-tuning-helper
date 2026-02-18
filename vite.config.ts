import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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
  ],
  worker: {
    format: 'es'
  }
})
