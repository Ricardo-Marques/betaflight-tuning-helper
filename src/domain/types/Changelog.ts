export type ChangelogCategory = 'feature' | 'fix' | 'improvement'

export interface ChangelogEntry {
  hash: string
  date: string       // ISO date string e.g. "2026-02-18"
  message: string    // Cleaned commit subject
  category: ChangelogCategory
}

export interface ChangelogData {
  entries: ChangelogEntry[]
  buildDate: string  // ISO date of the build
  buildHash: string  // Short hash of HEAD at build time
}
