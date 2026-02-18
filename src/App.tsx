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
        <div>
          <h1 className="text-2xl font-bold">Betaflight Tuning Helper</h1>
          <p className="text-sm text-blue-100">
            Analyze blackbox logs and get actionable tuning recommendations
          </p>
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

        {/* Left panel toggle */}
        <button
          data-testid="toggle-left-panel"
          onClick={uiStore.toggleLeftPanel}
          className="w-6 flex-shrink-0 flex items-center justify-center bg-gray-200 hover:bg-gray-300 transition-colors border-r border-gray-300"
          title={uiStore.leftPanelOpen ? 'Collapse left panel' : 'Expand left panel'}
        >
          <span className="text-gray-500 text-xs font-bold select-none">
            {uiStore.leftPanelOpen ? '\u2039' : '\u203A'}
          </span>
        </button>

        {/* Center: Chart */}
        <div className="flex-1 bg-white min-w-0">
          <LogChart />
        </div>

        {/* Right panel toggle */}
        <button
          data-testid="toggle-right-panel"
          onClick={uiStore.toggleRightPanel}
          className="w-6 flex-shrink-0 flex items-center justify-center bg-gray-200 hover:bg-gray-300 transition-colors border-l border-gray-300"
          title={uiStore.rightPanelOpen ? 'Collapse right panel' : 'Expand right panel'}
        >
          <span className="text-gray-500 text-xs font-bold select-none">
            {uiStore.rightPanelOpen ? '\u203A' : '\u2039'}
          </span>
        </button>

        {/* Right Panel: Recommendations */}
        {uiStore.rightPanelOpen && (
          <div data-testid="right-panel" className="w-[480px] flex-shrink-0 bg-white border-l">
            <RecommendationsPanel />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 text-xs p-2 text-center">
        Betaflight Tuning Helper | Built for Betaflight 4.4/4.5
      </footer>
    </div>
  )
})
