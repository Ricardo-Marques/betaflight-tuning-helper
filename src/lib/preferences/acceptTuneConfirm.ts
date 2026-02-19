const STORAGE_KEY = 'bf-accept-tune-confirm-dismissed'

export function shouldShowAcceptTuneConfirm(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true'
  } catch {
    return true
  }
}

export function dismissAcceptTuneConfirm(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // localStorage unavailable - silently ignore
  }
}
