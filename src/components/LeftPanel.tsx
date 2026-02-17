import { observer } from 'mobx-react-lite'
import { useLogStore, useAnalysisStore, useUIStore } from '../stores/RootStore'
import { FileUpload } from './FileUpload'

export const LeftPanel = observer(() => {
  const logStore = useLogStore()
  const analysisStore = useAnalysisStore()
  const uiStore = useUIStore()

  return (
    <div className="h-full flex flex-col bg-white border-r">
      {/* File Upload Section */}
      <div className="border-b">
        <FileUpload />
      </div>

      {/* Analysis Status / Re-analyze */}
      {logStore.isLoaded && (
        <div className="p-4 border-b">
          {analysisStore.analysisStatus === 'analyzing' && (
            <div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${analysisStore.analysisProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-600 mt-1 text-center">
                {analysisStore.analysisMessage}
              </p>
            </div>
          )}

          {analysisStore.isComplete && (
            <button
              onClick={() => analysisStore.analyze()}
              className="w-full px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm"
            >
              Re-analyze
            </button>
          )}
        </div>
      )}

      {/* Flight Segments */}
      {analysisStore.isComplete && analysisStore.segments.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">
              Flight Segments
            </h3>
            <div className="space-y-2">
              {analysisStore.segments.map(segment => (
                <button
                  key={segment.id}
                  onClick={() => {
                    analysisStore.selectSegment(segment.id)
                    if (logStore.frames.length > 0) {
                      const firstTime = logStore.frames[0].time
                      const totalDuration = logStore.frames[logStore.frames.length - 1].time - firstTime
                      if (totalDuration > 0) {
                        const padding = (segment.endTime - segment.startTime) * 0.05
                        const startPct = Math.max(0, ((segment.startTime - padding - firstTime) / totalDuration) * 100)
                        const endPct = Math.min(100, ((segment.endTime + padding - firstTime) / totalDuration) * 100)
                        uiStore.setZoom(startPct, endPct)
                      }
                    }
                  }}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    analysisStore.selectedSegmentId === segment.id
                      ? 'bg-blue-100 border-2 border-blue-500'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium capitalize">
                      {segment.phase}
                    </span>
                    {segment.issueCount > 0 && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                        {segment.issueCount} issue{segment.issueCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600">{segment.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Log Info */}
      {logStore.isLoaded && logStore.metadata && (
        <div className="p-4 border-t bg-gray-50">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Log Info</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p>
              <span className="font-medium">Firmware:</span>{' '}
              {logStore.metadata.firmwareType} {logStore.metadata.firmwareVersion}
            </p>
            <p>
              <span className="font-medium">Loop Rate:</span>{' '}
              {(logStore.metadata.looptime / 1000).toFixed(1)}kHz
            </p>
            <p>
              <span className="font-medium">Duration:</span>{' '}
              {logStore.metadata.duration.toFixed(1)}s
            </p>
            <p>
              <span className="font-medium">Frames:</span>{' '}
              {logStore.metadata.frameCount.toLocaleString()}
            </p>
            <p>
              <span className="font-medium">Motors:</span> {logStore.metadata.motorCount}
            </p>
            {logStore.metadata.debugMode && (
              <p>
                <span className="font-medium">Debug:</span>{' '}
                {logStore.metadata.debugMode}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
