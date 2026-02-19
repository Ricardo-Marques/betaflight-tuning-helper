const STORAGE_KEY = 'changelog-last-seen-build'

export function getLastSeenBuild(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function markBuildAsSeen(buildHash: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, buildHash)
  } catch {
    // localStorage unavailable - silently ignore
  }
}
