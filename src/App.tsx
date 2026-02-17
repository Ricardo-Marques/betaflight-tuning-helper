import { observer } from 'mobx-react-lite'
import { LeftPanel } from './components/LeftPanel'
import { LogChart } from './components/LogChart'
import { RecommendationsPanel } from './components/RecommendationsPanel'
import { useUIStore } from './stores/RootStore'

export const App = observer(() => {
  const uiStore = useUIStore()

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header data-testid="app-header" className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Betaflight Tuning Helper</h1>
            <p className="text-sm text-blue-100">
              Analyze blackbox logs and get actionable tuning recommendations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="toggle-left-panel"
              onClick={uiStore.toggleLeftPanel}
              className="p-2 rounded hover:bg-blue-700 transition-colors"
              title="Toggle left panel"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <button
              data-testid="toggle-right-panel"
              onClick={uiStore.toggleRightPanel}
              className="p-2 rounded hover:bg-blue-700 transition-colors"
              title="Toggle right panel"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        {uiStore.leftPanelOpen && (
          <div data-testid="left-panel" className="w-80 flex-shrink-0">
            <LeftPanel />
          </div>
        )}

        {/* Center: Chart */}
        <div className="flex-1 bg-white">
          <LogChart />
        </div>

        {/* Right Panel: Recommendations */}
        {uiStore.rightPanelOpen && (
          <div data-testid="right-panel" className="w-[480px] flex-shrink-0 bg-white border-l">
            <RecommendationsPanel />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 text-xs p-2 text-center">
        Betaflight Tuning Helper | Built for Betaflight 4.4/4.5 | Client-side
        processing
      </footer>
    </div>
  )
})
