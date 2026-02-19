import React from 'react'
import ReactDOM from 'react-dom/client'
import { observer } from 'mobx-react-lite'
import { ThemeProvider } from '@emotion/react'
import { App } from './App'
import './index.css'
import { RootStore, StoreProvider } from './stores/RootStore'
import { GlobalStyles } from './theme'
import { ErrorBoundary } from './components/ErrorBoundary'

// Create global store instance
const rootStore = new RootStore()

// Expose for dev tools and screenshot automation
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__rootStore = rootStore
}

const ThemedApp = observer(() => (
  <ThemeProvider theme={rootStore.themeStore.theme}>
    <GlobalStyles />
    <App />
  </ThemeProvider>
))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider value={rootStore}>
        <ThemedApp />
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

// Fade out and remove the loading screen once React has rendered
const loader = document.getElementById('loader')
if (loader) {
  loader.classList.add('fade-out')
  loader.addEventListener('transitionend', () => loader.remove())
}
