import { useState, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useAnalysisStore, useLogStore } from '../stores/RootStore'
import { Recommendation, DetectedIssue } from '../domain/types/Analysis'
import { generateCliCommands } from '../domain/utils/CliExport'

export const RecommendationsPanel = observer(() => {
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()
  const [copied, setCopied] = useState(false)

  const cliCommands = useMemo(() => {
    if (!analysisStore.isComplete) return ''
    const { recommendations } = analysisStore.result!
    const pidProfile = logStore.metadata?.pidProfile
    const filterSettings = logStore.metadata?.filterSettings
    return generateCliCommands(recommendations, pidProfile, filterSettings)
  }, [analysisStore.isComplete, analysisStore.result, logStore.metadata])

  if (!analysisStore.isComplete) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Run analysis to see recommendations</p>
      </div>
    )
  }

  const { summary } = analysisStore.result!

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliCommands)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text for manual copy
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Summary */}
      <div className="p-4 border-b bg-gray-50">
        <h2 className="text-lg font-bold mb-2">Analysis Summary</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Overall Health:</span>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                summary.overallHealth === 'excellent'
                  ? 'bg-green-100 text-green-800'
                  : summary.overallHealth === 'good'
                  ? 'bg-blue-100 text-blue-800'
                  : summary.overallHealth === 'needsWork'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {summary.overallHealth.toUpperCase()}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            <p>Critical Issues: {summary.criticalIssueCount}</p>
            <p>Major Issues: {summary.majorIssueCount}</p>
            <p>Minor Issues: {summary.minorIssueCount}</p>
          </div>
        </div>
      </div>

      {/* Top Priorities */}
      {summary.topPriorities.length > 0 && (
        <div className="p-4 border-b bg-blue-50">
          <h3 className="text-sm font-bold mb-2 text-blue-900">
            Top Priorities:
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            {summary.topPriorities.map((priority, idx) => (
              <li key={idx}>{priority}</li>
            ))}
          </ol>
        </div>
      )}

      {/* CLI Commands */}
      {cliCommands && (
        <div className="p-4 border-b bg-indigo-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-indigo-900">
              CLI Commands
            </h3>
            <button
              onClick={handleCopy}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {copied ? 'Copied!' : 'Copy CLI Commands'}
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-indigo-700 font-medium">
              Preview commands
            </summary>
            <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs font-mono rounded overflow-x-auto max-h-64 overflow-y-auto">
              {cliCommands}
            </pre>
          </details>
        </div>
      )}

      {/* Critical Issues */}
      {analysisStore.criticalIssues.length > 0 && (
        <div className="p-4 border-b">
          <h3 className="text-md font-bold mb-3 text-red-700">
            Critical Issues
          </h3>
          <div className="space-y-3">
            {analysisStore.criticalIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="p-4">
        <h3 className="text-md font-bold mb-3">Recommendations</h3>
        <div className="space-y-4">
          {analysisStore.highPriorityRecommendations.map(rec => (
            <RecommendationCard key={rec.id} recommendation={rec} />
          ))}
        </div>
      </div>
    </div>
  )
})

const IssueCard = observer(({ issue }: { issue: DetectedIssue }) => {
  return (
    <div
      className={`p-3 rounded-lg border-l-4 ${
        issue.severity === 'critical'
          ? 'bg-red-50 border-red-500'
          : issue.severity === 'high'
          ? 'bg-orange-50 border-orange-500'
          : 'bg-yellow-50 border-yellow-500'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-sm">{issue.description}</h4>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            issue.severity === 'critical'
              ? 'bg-red-100 text-red-800'
              : issue.severity === 'high'
              ? 'bg-orange-100 text-orange-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {issue.severity.toUpperCase()}
        </span>
      </div>
      <div className="text-xs text-gray-600 space-y-1">
        <p>
          <span className="font-medium">Axis:</span> {issue.axis}
        </p>
        {issue.metrics.overshoot !== undefined && (
          <p>
            <span className="font-medium">Overshoot:</span>{' '}
            {issue.metrics.overshoot.toFixed(1)}°
          </p>
        )}
        {issue.metrics.frequency !== undefined && (
          <p>
            <span className="font-medium">Frequency:</span>{' '}
            {issue.metrics.frequency.toFixed(1)} Hz
          </p>
        )}
        {issue.metrics.amplitude !== undefined && (
          <p>
            <span className="font-medium">Amplitude:</span>{' '}
            {issue.metrics.amplitude.toFixed(1)}°/s
          </p>
        )}
        <p>
          <span className="font-medium">Confidence:</span>{' '}
          {(issue.confidence * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  )
})

const RecommendationCard = observer(
  ({ recommendation }: { recommendation: Recommendation }) => {
    return (
      <div className="p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-bold text-sm">{recommendation.title}</h4>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
              Priority: {recommendation.priority}
            </span>
            <span className="text-xs text-gray-500">
              {(recommendation.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-3">
          {recommendation.description}
        </p>

        {/* Changes */}
        <div className="mb-3 p-3 bg-gray-50 rounded">
          <h5 className="text-xs font-bold text-gray-700 mb-2">
            Recommended Changes:
          </h5>
          <ul className="space-y-2">
            {recommendation.changes.map((change, idx) => (
              <li key={idx} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-medium text-blue-700">
                    {change.parameter}
                    {change.axis ? `[${change.axis}]` : ''}:
                  </span>
                  <span className="font-mono font-bold text-green-700">
                    {change.recommendedChange}
                  </span>
                </div>
                <p className="text-xs text-gray-600 ml-4 mt-1">
                  {change.explanation}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Rationale */}
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-700 font-medium mb-1">
            Why this helps
          </summary>
          <p className="text-gray-600 text-xs ml-4 mb-2">
            {recommendation.rationale}
          </p>
        </details>

        {/* Expected Improvement */}
        <div className="mt-2 p-2 bg-green-50 rounded">
          <p className="text-xs text-green-800">
            <span className="font-medium">Expected improvement:</span>{' '}
            {recommendation.expectedImprovement}
          </p>
        </div>

        {/* Risks */}
        {recommendation.risks.length > 0 && (
          <details className="text-sm mt-2">
            <summary className="cursor-pointer text-orange-700 font-medium">
              Risks
            </summary>
            <ul className="list-disc list-inside text-xs text-orange-600 ml-4 mt-1 space-y-1">
              {recommendation.risks.map((risk, idx) => (
                <li key={idx}>{risk}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    )
  }
)
