/**
 * RootStore for the Android app.
 *
 * Wires together all stores with the Android-specific serial factory.
 * The AnalysisStore, SettingsStore, and LogStore logic is identical to the
 * web app — only SerialStore and FlashDownloadStore use Android USB instead
 * of the Web Serial API.
 */
import { createContext, useContext } from 'react'
import { LogStore } from './LogStore'
import { AnalysisStore } from './AnalysisStore'
import { SerialStore } from './SerialStore'
import { FlashDownloadStore } from './FlashDownloadStore'

// Re-use the web app's AnalysisStore and SettingsStore directly — they have no
// platform-specific dependencies (no localStorage in AnalysisStore).
// We do NOT re-use UIStore (it uses window.matchMedia) or ThemeStore (Emotion).
// We do NOT re-use SettingsStore either until we verify localStorage usage.

export class RootStore {
  logStore: LogStore
  analysisStore: AnalysisStore
  serialStore: SerialStore
  flashDownloadStore: FlashDownloadStore

  constructor() {
    this.logStore = new LogStore()
    this.analysisStore = new AnalysisStore(this.logStore)
    this.serialStore = new SerialStore()
    this.flashDownloadStore = new FlashDownloadStore(this.logStore)

    // Wire auto-analyze: when parse completes, trigger analysis automatically
    this.logStore.setAutoAnalyzer(this.analysisStore)
  }

  reset(): void {
    this.logStore.reset()
    this.analysisStore.reset()
  }
}

const StoreContext = createContext<RootStore | null>(null)

export const StoreProvider = StoreContext.Provider

export function useStores(): RootStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStores must be used within a StoreProvider')
  return store
}

export function useLogStore(): LogStore {
  return useStores().logStore
}

export function useAnalysisStore(): AnalysisStore {
  return useStores().analysisStore
}

export function useSerialStore(): SerialStore {
  return useStores().serialStore
}

export function useFlashDownloadStore(): FlashDownloadStore {
  return useStores().flashDownloadStore
}
