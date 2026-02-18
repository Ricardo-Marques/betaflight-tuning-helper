import React from 'react'
import ReactDOM from 'react-dom/client'
import { observer } from 'mobx-react-lite'
import { ThemeProvider } from '@emotion/react'
import { App } from './App'
import './index.css'
import { RootStore, StoreProvider } from './stores/RootStore'
import { GlobalStyles } from './theme'

// Create global store instance
const rootStore = new RootStore()

const ThemedApp = observer(() => (
  <ThemeProvider theme={rootStore.themeStore.theme}>
    <GlobalStyles />
    <App />
  </ThemeProvider>
))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider value={rootStore}>
      <ThemedApp />
    </StoreProvider>
  </React.StrictMode>
)
