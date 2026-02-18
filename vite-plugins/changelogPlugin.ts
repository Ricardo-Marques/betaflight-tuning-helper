import { execSync } from 'child_process'
import type { Plugin } from 'vite'

interface ChangelogEntry {
  hash: string
  date: string
  message: string
  category: 'feature' | 'fix' | 'improvement'
}

interface ChangelogData {
  entries: ChangelogEntry[]
  buildDate: string
  buildHash: string
}

const VIRTUAL_ID = 'virtual:changelog'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function categorize(subject: string): 'feature' | 'fix' | 'improvement' | 'chore' {
  const s = subject.trimStart()
  if (/^Add\b/i.test(s)) return 'feature'
  if (/^Fix\b/i.test(s)) return 'fix'
  if (/^(Update|Improve|Migrate|Polish|Refactor|Enhance|Optimize)\b/i.test(s)) return 'improvement'
  return 'chore'
}

function buildChangelog(): ChangelogData {
  let raw = ''
  let headHash = 'unknown'
  try {
    raw = execSync('git log --format="%H|%as|%s" --no-merges -100', { encoding: 'utf-8' })
    headHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    // Git not available (e.g. built from tarball) — return empty
    return { entries: [], buildDate: new Date().toISOString(), buildHash: 'unknown' }
  }

  const entries: ChangelogEntry[] = []
  for (const line of raw.trim().split('\n')) {
    if (!line) continue
    const parts = line.split('|')
    if (parts.length < 3) continue
    const hash = parts[0]
    const date = parts[1]
    const message = parts.slice(2).join('|') // subject may contain |
    const category = categorize(message)
    if (category === 'chore') continue
    entries.push({ hash: hash.slice(0, 7), date, message, category })
  }

  return {
    entries,
    buildDate: new Date().toISOString(),
    buildHash: headHash,
  }
}

export function changelogPlugin(): Plugin {
  return {
    name: 'changelog',
    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id: string) {
      if (id === RESOLVED_ID) {
        const data = buildChangelog()
        return `export default ${JSON.stringify(data)}`
      }
    },
  }
}
