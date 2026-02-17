import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useAnalysisStore, useLogStore, useUIStore } from '../stores/RootStore'
import { Recommendation, DetectedIssue } from '../domain/types/Analysis'
import { generateCliCommands } from '../domain/utils/CliExport'

export const RecommendationsPanel = observer(() => {
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()
  const [copied, setCopied] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const cliCommands = useMemo(() => {
    if (!analysisStore.isComplete) return ''
    const { recommendations } = analysisStore.result!
    const pidProfile = logStore.metadata?.pidProfile
    const filterSettings = logStore.metadata?.filterSettings
    return generateCliCommands(recommendations, pidProfile, filterSettings)
  }, [analysisStore.isComplete, analysisStore.result, logStore.metadata])

  // Group issues by severity
  const issuesBySeverity = useMemo(() => {
    const groups: Record<string, DetectedIssue[]> = {}
    for (const issue of analysisStore.issues) {
      ;(groups[issue.severity] ??= []).push(issue)
    }
    return groups
  }, [analysisStore.issues])

  // Auto-scroll to selected issue
  useEffect(() => {
    const id = analysisStore.selectedIssueId
    if (!id || !scrollRef.current) return
    const el = scrollRef.current.querySelector(`[data-issue-id="${id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [analysisStore.selectedIssueId])

  const scrollToRec = useCallback((recId: string) => {
    if (!scrollRef.current) return
    const el = scrollRef.current.querySelector(`[data-rec-id="${recId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      analysisStore.selectRecommendation(recId)
      setTimeout(() => analysisStore.selectRecommendation(null), 2000)
    }
  }, [analysisStore])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cliCommands)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text for manual copy
    }
  }, [cliCommands])

  if (!analysisStore.isComplete) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Run analysis to see recommendations</p>
      </div>
    )
  }

  const { summary } = analysisStore.result!

  const severityOrder = ['high', 'medium', 'low'] as const
  const severityLabels: Record<string, string> = {
    high: 'High Severity Issues',
    medium: 'Medium Severity Issues',
    low: 'Low Severity Issues',
  }
  const severityColors: Record<string, string> = {
    high: 'text-red-700',
    medium: 'text-amber-700',
    low: 'text-blue-700',
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
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

      {/* All Issues grouped by severity */}
      {severityOrder.map(sev => {
        const issues = issuesBySeverity[sev]
        if (!issues || issues.length === 0) return null
        return (
          <div key={sev} className="p-4 border-b">
            <h3 className={`text-md font-bold mb-3 ${severityColors[sev]}`}>
              {severityLabels[sev]}
            </h3>
            <div className="space-y-3">
              {issues.map(issue => (
                <IssueCard key={issue.id} issue={issue} onScrollToRec={scrollToRec} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Recommendations */}
      <div className="p-4">
        <h3 className="text-md font-bold mb-3">Recommendations</h3>
        <div className="space-y-4">
          {analysisStore.recommendations.map(rec => (
            <RecommendationCard key={rec.id} recommendation={rec} />
          ))}
        </div>
      </div>
    </div>
  )
})

const IssueCard = observer(({ issue, onScrollToRec }: { issue: DetectedIssue; onScrollToRec: (recId: string) => void }) => {
  const analysisStore = useAnalysisStore()
  const uiStore = useUIStore()
  const logStore = useLogStore()
  const [occIdx, setOccIdx] = useState(0)

  const occurrences = issue.occurrences ?? [issue.timeRange]
  const hasMultiple = occurrences.length > 1
  const linkedRecs = analysisStore.getRecommendationsForIssue(issue.id)

  const zoomToOccurrence = useCallback(
    (idx: number) => {
      analysisStore.selectIssue(issue.id)

      if (logStore.frames.length > 0) {
        const firstTime = logStore.frames[0].time
        const totalDuration =
          logStore.frames[logStore.frames.length - 1].time - firstTime
        if (totalDuration > 0) {
          const tr = occurrences[idx]
          const occSpan = tr[1] - tr[0]
          const padding = Math.max(occSpan * 2, 500_000) // min 0.5s in µs
          const startPct = Math.max(
            0,
            ((tr[0] - padding - firstTime) / totalDuration) * 100
          )
          const endPct = Math.min(
            100,
            ((tr[1] + padding - firstTime) / totalDuration) * 100
          )
          uiStore.animateZoom(startPct, endPct)
        }
      }
    },
    [analysisStore, uiStore, logStore, issue, occurrences]
  )

  const handleClick = useCallback(() => {
    zoomToOccurrence(occIdx)
  }, [zoomToOccurrence, occIdx])

  const handlePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const next = Math.max(0, occIdx - 1)
      setOccIdx(next)
      zoomToOccurrence(next)
    },
    [occIdx, zoomToOccurrence]
  )

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const next = Math.min(occurrences.length - 1, occIdx + 1)
      setOccIdx(next)
      zoomToOccurrence(next)
    },
    [occIdx, occurrences.length, zoomToOccurrence]
  )

  const isSelected = analysisStore.selectedIssueId === issue.id

  return (
    <div
      data-issue-id={issue.id}
      onClick={handleClick}
      className={`p-3 rounded-lg border-l-4 cursor-pointer transition-shadow hover:shadow-md ${
        issue.severity === 'high'
          ? 'bg-red-50 border-red-500'
          : issue.severity === 'medium'
          ? 'bg-amber-50 border-amber-500'
          : 'bg-blue-50 border-blue-400'
      } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-sm">{issue.description}</h4>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            issue.severity === 'high'
              ? 'bg-red-100 text-red-800'
              : issue.severity === 'medium'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-blue-100 text-blue-800'
          }`}
        >
          {issue.severity.toUpperCase()}
        </span>
      </div>

      {/* Occurrence navigator */}
      {hasMultiple && (
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handlePrev}
            disabled={occIdx === 0}
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 hover:bg-gray-300 disabled:opacity-40 disabled:cursor-default"
          >
            &lt;
          </button>
          <span className="text-xs font-medium text-gray-600">
            {occIdx + 1}/{occurrences.length}
          </span>
          <button
            onClick={handleNext}
            disabled={occIdx === occurrences.length - 1}
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 hover:bg-gray-300 disabled:opacity-40 disabled:cursor-default"
          >
            &gt;
          </button>
        </div>
      )}

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

      {/* Linked recommendations */}
      {linkedRecs.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
          {linkedRecs.map(rec => (
            <button
              key={rec.id}
              onClick={(e) => {
                e.stopPropagation()
                onScrollToRec(rec.id)
              }}
              className="block text-xs text-blue-600 hover:text-blue-800 hover:underline truncate w-full text-left"
            >
              See: {rec.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

const RecommendationCard = observer(
  ({ recommendation }: { recommendation: Recommendation }) => {
    const analysisStore = useAnalysisStore()
    const isHighlighted = analysisStore.selectedRecommendationId === recommendation.id

    return (
      <div data-rec-id={recommendation.id} className={`p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow ${isHighlighted ? 'ring-2 ring-blue-500' : ''}`}>
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
