import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:changelog'
const RESOLVED_ID = '\0' + VIRTUAL_ID

export function changelogPlugin(): Plugin {
  const changelogPath = path.resolve(__dirname, '../src/data/changelog.ts')

  return {
    name: 'changelog',
    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    configureServer(server) {
      server.watcher.add(changelogPath)
      server.watcher.on('change', (file) => {
        if (path.normalize(file) === path.normalize(changelogPath)) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
          if (mod) {
            server.moduleGraph.invalidateModule(mod)
            server.ws.send({ type: 'full-reload' })
          }
        }
      })
    },
    load(id: string) {
      if (id !== RESOLVED_ID) return

      let buildHash = 'unknown'
      try {
        buildHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
      } catch {
        // Git not available
      }

      // Read the static changelog source and re-export it as ChangelogData
      const changelogPath = path.resolve(__dirname, '../src/data/changelog.ts')
      const source = fs.readFileSync(changelogPath, 'utf-8')

      // Extract the array literal from the source
      const match = source.match(/export const CHANGELOG_ENTRIES[^=]*=\s*(\[[\s\S]*\])/)
      const entriesJson = match ? match[1] : '[]'

      return `export default {
        entries: ${entriesJson},
        buildDate: ${JSON.stringify(new Date().toISOString())},
        buildHash: ${JSON.stringify(buildHash)},
      }`
    },
  }
}
