import { LogStore } from './LogStore'
import { AnalysisStore } from './AnalysisStore'
import { UIStore } from './UIStore'
import { createContext, useContext } from 'react'

/**
 * Root store combining all stores
 */
export class RootStore {
  logStore: LogStore
  analysisStore: AnalysisStore
  uiStore: UIStore

  constructor() {
    this.logStore = new LogStore()
    this.analysisStore = new AnalysisStore(this.logStore)
    this.uiStore = new UIStore()
  }

  /**
   * Reset all stores
   */
  reset(): void {
    this.logStore.reset()
    this.analysisStore.reset()
    this.uiStore.reset()
  }
}

// Create React context for stores
const StoreContext = createContext<RootStore | null>(null)

export const StoreProvider = StoreContext.Provider

export function useStores(): RootStore {
  const store = useContext(StoreContext)
  if (!store) {
    throw new Error('useStores must be used within a StoreProvider')
  }
  return store
}

export function useLogStore(): LogStore {
  return useStores().logStore
}

export function useAnalysisStore(): AnalysisStore {
  return useStores().analysisStore
}

export function useUIStore(): UIStore {
  return useStores().uiStore
}
