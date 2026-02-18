import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useAnalysisStore, useLogStore, useUIStore } from '../stores/RootStore'
import { Recommendation, DetectedIssue, ParameterChange, Axis } from '../domain/types/Analysis'
import { PidProfile, FilterSettings } from '../domain/types/LogFrame'
import {
  generateCliCommands,
  PARAMETER_DISPLAY_NAMES,
  getCliName,
  resolveChange,
  getPidValue,
  getGlobalValue,
} from '../domain/utils/CliExport'
import { RightPanelTab } from '../stores/UIStore'

// Per-axis PID params that use resolveChange with isPerAxisPid=true
const PER_AXIS_PID_PARAMS = new Set([
  'pidPGain', 'pidIGain', 'pidDGain', 'pidDMinGain', 'pidFeedforward',
])

/**
 * Compute resolved current→new values for a change
 */
function computeTransition(
  change: ParameterChange,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings
): { current: number | undefined; resolved: number | null } {
  const isPerAxis = PER_AXIS_PID_PARAMS.has(change.parameter)
  const current = change.currentValue
    ?? (isPerAxis
      ? getPidValue(pidProfile, change.parameter, change.axis)
      : getGlobalValue(change.parameter, pidProfile, filterSettings))
  const [resolved] = resolveChange(change.recommendedChange, current, isPerAxis)
  return { current, resolved }
}

/* ---- Styled Components ---- */

const PanelWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  color: ${p => p.theme.colors.text.primary};
`

const EmptyPanel = styled.div`
  padding: 1rem;
  text-align: center;
  color: ${p => p.theme.colors.text.muted};
`

const CliBar = styled.div`
  flex-shrink: 0;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.accent.indigoBg};
`

const CliBarInner = styled.div`
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const CliLabel = styled.span`
  font-size: 0.875rem;
  font-weight: 700;
  color: ${p => p.theme.colors.accent.indigoText};
`

const CliPreviewToggle = styled.button`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.accent.indigo};
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
`

const CopyButton = styled.button<{ copied: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  transition: background-color 0.15s;
  border: none;
  cursor: pointer;
  color: ${p => p.theme.colors.button.primaryText};
  background-color: ${p => p.copied ? p.theme.colors.accent.green : p.theme.colors.accent.indigo};

  &:hover {
    opacity: 0.9;
  }
`

const CliPreview = styled.pre`
  padding: 0.75rem;
  background-color: ${p => p.theme.colors.background.cliPreview};
  color: ${p => p.theme.colors.accent.green};
  font-size: 0.75rem;
  font-family: monospace;
  border-radius: 0 0 0.25rem 0.25rem;
  overflow-x: auto;
  max-height: 12rem;
  overflow-y: auto;
  margin: 0 0.75rem 0.75rem;
`

const TabBar = styled.div`
  flex-shrink: 0;
  display: flex;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.background.panel};
`

const Tab = styled.button<{ isActive: boolean }>`
  flex: 1;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.15s;
  border: none;
  border-bottom: 2px solid ${p => p.isActive ? p.theme.colors.button.primary : 'transparent'};
  background: none;
  cursor: pointer;
  color: ${p => p.isActive ? p.theme.colors.text.link : p.theme.colors.text.muted};

  &:hover {
    color: ${p => p.isActive ? p.theme.colors.text.link : p.theme.colors.text.primary};
  }
`

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
`

const SummarySection = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.background.section};
`

const SummaryTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: ${p => p.theme.colors.text.heading};
`

const HealthBadge = styled.span<{ health: string }>`
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  background-color: ${p => {
    switch (p.health) {
      case 'excellent': return p.theme.colors.health.excellentBg
      case 'good': return p.theme.colors.health.goodBg
      case 'needsWork': return p.theme.colors.health.needsWorkBg
      default: return p.theme.colors.health.criticalBg
    }
  }};
  color: ${p => {
    switch (p.health) {
      case 'excellent': return p.theme.colors.health.excellentText
      case 'good': return p.theme.colors.health.goodText
      case 'needsWork': return p.theme.colors.health.needsWorkText
      default: return p.theme.colors.health.criticalText
    }
  }};
`

const ProfileLabel = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
`

const SeverityCount = styled.p<{ severity: string }>`
  font-size: 0.875rem;
  color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.high
    : p.severity === 'medium' ? p.theme.colors.severity.medium
    : p.theme.colors.severity.low};
`

const PrioritiesSection = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.severity.lowBg};
`

const PrioritiesTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: ${p => p.theme.colors.severity.lowText};
`

const PriorityList = styled.ol`
  list-style-type: decimal;
  list-style-position: inside;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.severity.lowText};

  & > li + li {
    margin-top: 0.25rem;
  }
`

const SeverityGroup = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
`

const SeverityGroupTitle = styled.h3<{ severity: string }>`
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.high
    : p.severity === 'medium' ? p.theme.colors.severity.medium
    : p.theme.colors.severity.low};
`

const NoItemsText = styled.div`
  padding: 2rem;
  text-align: center;
  color: ${p => p.theme.colors.text.muted};
`

const FixesSection = styled.div`
  padding: 1rem;
`

/* ---- Issue Card ---- */

const IssueCardWrapper = styled.div<{ severity: string; isSelected: boolean }>`
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
  border-left: 4px solid ${p =>
    p.severity === 'high' ? p.theme.colors.severity.high
    : p.severity === 'medium' ? p.theme.colors.severity.medium
    : p.theme.colors.severity.low};
  background-color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highBg
    : p.severity === 'medium' ? p.theme.colors.severity.mediumBg
    : p.theme.colors.severity.lowBg};
  ${p => p.isSelected && `
    ring: 2px;
    box-shadow: 0 0 0 2px ${p.theme.colors.border.focus};
  `}

  &:hover {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }
`

const SeverityBadge = styled.span<{ severity: string }>`
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  background-color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highBg
    : p.severity === 'medium' ? p.theme.colors.severity.mediumBg
    : p.theme.colors.severity.lowBg};
  color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highText
    : p.severity === 'medium' ? p.theme.colors.severity.mediumText
    : p.theme.colors.severity.lowText};
`

const IssueTitle = styled.h4`
  font-weight: 500;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};
`

const NavButton = styled.button`
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  background-color: ${p => p.theme.colors.button.secondary};
  color: ${p => p.theme.colors.text.primary};

  &:hover {
    background-color: ${p => p.theme.colors.button.secondaryHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

const NavLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.secondary};
`

const IssueMetrics = styled.div`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};

  & > p + p {
    margin-top: 0.25rem;
  }
`

const LinkedRecLink = styled.button`
  display: block;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.link};
  background: none;
  border: none;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  text-align: left;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
    text-decoration: underline;
  }
`

const LinkedRecBorder = styled.div`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};

  & > button + button {
    margin-top: 0.25rem;
  }
`

/* ---- Recommendation Card ---- */

const RecCardWrapper = styled.div<{ isHighlighted: boolean }>`
  padding: 1rem;
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.5rem;
  background-color: ${p => p.theme.colors.background.panel};
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  transition: box-shadow 0.15s;
  ${p => p.isHighlighted && `
    box-shadow: 0 0 0 2px ${p.theme.colors.border.focus};
  `}

  &:hover {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }
`

const RecTitle = styled.h4`
  font-weight: 700;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};
`

const PriorityBadge = styled.span`
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  background-color: ${p => p.theme.colors.severity.lowBg};
  color: ${p => p.theme.colors.severity.lowText};
`

const ConfidenceLabel = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
`

const RecDescription = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.75rem;
`

const ChangesBlock = styled.div`
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background-color: ${p => p.theme.colors.background.section};
  border-radius: 0.25rem;
`

const ChangesTitle = styled.h5`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.5rem;
`

const RationaleLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.125rem;
`

const RationaleText = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
`

const ExpectedBlock = styled.div`
  padding: 0.5rem;
  background-color: ${p => p.theme.colors.accent.greenBg};
  border-radius: 0.25rem;
`

const ExpectedText = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.accent.greenText};
`

const RisksSection = styled.details`
  font-size: 0.875rem;
  margin-top: 0.5rem;
`

const RisksSummary = styled.summary`
  cursor: pointer;
  color: ${p => p.theme.colors.accent.orangeText};
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.375rem;
`

const RiskDot = styled.span`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: ${p => p.theme.colors.accent.orange};
`

const RiskList = styled.ul`
  list-style-type: disc;
  list-style-position: inside;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.accent.orangeText};
  margin-left: 1rem;
  margin-top: 0.25rem;

  & > li + li {
    margin-top: 0.25rem;
  }
`

const LinkedIssuesSection = styled.div`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};
`

const LinkedIssuesSummary = styled.p`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.secondary};
  margin-bottom: 0.25rem;
`

const LinkedIssueLink = styled.button`
  display: block;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.link};
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
    text-decoration: underline;
  }

  & + & {
    margin-top: 0.125rem;
  }
`

/* ---- Change Display ---- */

const ChangeParamName = styled.span`
  font-weight: 500;
  color: ${p => p.theme.colors.text.heading};
`

const ChangeValue = styled.span<{ direction: 'increase' | 'decrease' | 'neutral' }>`
  font-family: monospace;
  font-weight: 700;
  color: ${p => {
    switch (p.direction) {
      case 'increase': return p.theme.colors.change.increase
      case 'decrease': return p.theme.colors.change.decrease
      default: return p.theme.colors.change.neutral
    }
  }};
`

const ChangeFallback = styled.span`
  font-family: monospace;
  font-weight: 700;
  color: ${p => p.theme.colors.text.link};
`

const CliSnippet = styled.code`
  background-color: ${p => p.theme.colors.background.section};
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
`

/* ---- Main Panel Component ---- */

export const RecommendationsPanel = observer(() => {
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const [copied, setCopied] = useState(false)
  const [cliExpanded, setCliExpanded] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const pidProfile = logStore.metadata?.pidProfile
  const filterSettings = logStore.metadata?.filterSettings

  const cliCommands = useMemo(() => {
    if (!analysisStore.isComplete) return ''
    const { recommendations } = analysisStore.result!
    return generateCliCommands(recommendations, pidProfile, filterSettings)
  }, [analysisStore.isComplete, analysisStore.result, pidProfile, filterSettings])

  const commandCount = useMemo(() => {
    return (cliCommands.match(/^set /gm) || []).length
  }, [cliCommands])

  const unresolvedCount = useMemo(() => {
    return (cliCommands.match(/current value unknown/gm) || []).length
  }, [cliCommands])

  // Group issues by severity
  const issuesBySeverity = useMemo(() => {
    const groups: Record<string, DetectedIssue[]> = {}
    for (const issue of analysisStore.issues) {
      const sev = issue.severity
      if (!groups[sev]) groups[sev] = []
      groups[sev].push(issue)
    }
    return groups
  }, [analysisStore.issues])

  // Auto-scroll to selected issue (wait for Issues tab to render)
  useEffect(() => {
    const id = analysisStore.selectedIssueId
    if (!id || !scrollRef.current || uiStore.activeRightTab !== 'issues') return
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-issue-id="${id}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [analysisStore.selectedIssueId, uiStore.activeRightTab])

  const navigateToRec = useCallback((recId: string) => {
    uiStore.setActiveRightTab('fixes')
    // Wait for tab switch to render, then scroll
    requestAnimationFrame(() => {
      if (!scrollRef.current) return
      const el = scrollRef.current.querySelector(`[data-rec-id="${recId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        analysisStore.selectRecommendation(recId)
        setTimeout(() => analysisStore.selectRecommendation(null), 2000)
      }
    })
  }, [analysisStore, uiStore])

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
      <EmptyPanel data-testid="recommendations-empty">
        <p>Run analysis to see recommendations</p>
      </EmptyPanel>
    )
  }

  const { summary } = analysisStore.result!
  const activeTab = uiStore.activeRightTab
  const issueCount = analysisStore.issues.length
  const recCount = analysisStore.recommendations.length

  const severityOrder = ['high', 'medium', 'low'] as const
  const severityLabels: Record<string, string> = {
    high: 'High Severity Issues',
    medium: 'Medium Severity Issues',
    low: 'Low Severity Issues',
  }

  return (
    <PanelWrapper>
      {/* Sticky CLI Action Bar */}
      {cliCommands && (
        <CliBar data-testid="cli-commands-section">
          <CliBarInner>
            <CliLabel>
              {commandCount} CLI command{commandCount !== 1 ? 's' : ''}{unresolvedCount > 0 ? ` (${unresolvedCount} need manual values)` : ''}
            </CliLabel>
            <div className="flex items-center justify-end gap-2">
              <CliPreviewToggle onClick={() => setCliExpanded(!cliExpanded)}>
                {cliExpanded ? 'Hide' : 'Preview'}
              </CliPreviewToggle>
              <CopyButton
                data-testid="copy-cli-button"
                copied={copied}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </CopyButton>
            </div>
          </CliBarInner>
          {cliExpanded && (
            <CliPreview>{cliCommands}</CliPreview>
          )}
        </CliBar>
      )}

      {/* Tab Bar */}
      <TabBar>
        {([
          ['summary', 'Summary'],
          ['issues', `Issues (${issueCount})`],
          ['fixes', `Fixes (${recCount})`],
        ] as [RightPanelTab, string][]).map(([tab, label]) => (
          <Tab
            key={tab}
            isActive={activeTab === tab}
            onClick={() => uiStore.setActiveRightTab(tab)}
          >
            {label}
          </Tab>
        ))}
      </TabBar>

      {/* Tab Content */}
      <TabContent ref={scrollRef}>
        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <>
            <SummarySection data-testid="analysis-summary">
              <SummaryTitle>Analysis Summary</SummaryTitle>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Overall Health:</span>
                  <HealthBadge data-testid="overall-health-badge" health={summary.overallHealth}>
                    {summary.overallHealth.toUpperCase()}
                  </HealthBadge>
                </div>
                <div className="flex items-center gap-2">
                  <ProfileLabel>Profile: {analysisStore.quadProfile.label}</ProfileLabel>
                </div>
                <div className="space-y-1">
                  <SeverityCount severity="high">High: {summary.highIssueCount}</SeverityCount>
                  <SeverityCount severity="medium">Medium: {summary.mediumIssueCount}</SeverityCount>
                  <SeverityCount severity="low">Low: {summary.lowIssueCount}</SeverityCount>
                </div>
              </div>
            </SummarySection>

            {summary.topPriorities.length > 0 && (
              <PrioritiesSection data-testid="top-priorities">
                <PrioritiesTitle>Top Priorities:</PrioritiesTitle>
                <PriorityList>
                  {summary.topPriorities.map((priority, idx) => (
                    <li key={idx}>{priority}</li>
                  ))}
                </PriorityList>
              </PrioritiesSection>
            )}
          </>
        )}

        {/* Issues Tab */}
        {activeTab === 'issues' && (
          <>
            {severityOrder.map(sev => {
              const issues = issuesBySeverity[sev]
              if (!issues || issues.length === 0) return null
              return (
                <SeverityGroup key={sev} data-testid={`severity-group-${sev}`}>
                  <SeverityGroupTitle severity={sev}>
                    {severityLabels[sev]}
                  </SeverityGroupTitle>
                  <div key={analysisStore.selectedIssueId ?? ''} className={`space-y-3${analysisStore.selectedIssueId ? ' dim-siblings' : ''}`}>
                    {issues.map(issue => (
                      <IssueCard key={issue.id} issue={issue} onNavigateToRec={navigateToRec} />
                    ))}
                  </div>
                </SeverityGroup>
              )
            })}
            {issueCount === 0 && (
              <NoItemsText>
                <p>No issues detected</p>
              </NoItemsText>
            )}
          </>
        )}

        {/* Fixes Tab */}
        {activeTab === 'fixes' && (
          <FixesSection data-testid="recommendations-section">
            <div key={analysisStore.selectedRecommendationId ?? ''} className={`space-y-4${analysisStore.selectedRecommendationId ? ' dim-siblings' : ''}`}>
              {analysisStore.recommendations.map(rec => (
                <RecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  pidProfile={pidProfile}
                  filterSettings={filterSettings}
                />
              ))}
            </div>
            {recCount === 0 && (
              <NoItemsText>
                <p>No recommendations</p>
              </NoItemsText>
            )}
          </FixesSection>
        )}
      </TabContent>
    </PanelWrapper>
  )
})

const IssueCard = observer(({ issue, onNavigateToRec }: { issue: DetectedIssue; onNavigateToRec: (recId: string) => void }) => {
  const analysisStore = useAnalysisStore()
  const uiStore = useUIStore()
  const logStore = useLogStore()
  const [occIdx, setOccIdx] = useState(0)

  // Sync local occurrence index when selected externally (e.g. clicking chart pill)
  const storeOccIdx = analysisStore.selectedOccurrenceIdx
  const isSelected = analysisStore.selectedIssueId === issue.id
  useEffect(() => {
    if (isSelected && storeOccIdx != null && storeOccIdx !== occIdx) {
      setOccIdx(storeOccIdx)
    }
  }, [isSelected, storeOccIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const occurrences = issue.occurrences ?? [issue.timeRange]
  const hasMultiple = occurrences.length > 1
  const linkedRecs = analysisStore.getRecommendationsForIssue(issue.id)

  const zoomToOccurrence = useCallback(
    (idx: number) => {
      analysisStore.selectIssue(issue.id, idx)

      const frames = logStore.frames
      if (frames.length > 0) {
        const tr = occurrences[idx]
        const occTime = tr[0]

        // Check if this occurrence is already visible in the current view
        const startFrame = Math.floor((uiStore.zoomStart / 100) * frames.length)
        const endFrame = Math.min(frames.length - 1, Math.ceil((uiStore.zoomEnd / 100) * frames.length))
        const viewStart = frames[startFrame]?.time ?? 0
        const viewEnd = frames[endFrame]?.time ?? Infinity
        if (occTime >= viewStart && occTime <= viewEnd) return

        // Occurrence is off-screen — navigate to center it
        let lo = 0, hi = frames.length - 1
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if (frames[mid].time < occTime) lo = mid + 1
          else hi = mid
        }
        const centerPct = (lo / frames.length) * 100
        const halfDur = (uiStore.zoomEnd - uiStore.zoomStart) / 2
        let newStart = centerPct - halfDur
        let newEnd = centerPct + halfDur
        if (newStart < 0) { newEnd -= newStart; newStart = 0 }
        if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
        uiStore.animateZoom(Math.max(0, newStart), Math.min(100, newEnd))
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

  return (
    <IssueCardWrapper
      data-issue-id={issue.id}
      data-selected={isSelected || undefined}
      severity={issue.severity}
      isSelected={isSelected}
      onClick={handleClick}
      className={isSelected ? 'attention-pulse selected-item' : ''}
    >
      <div className="flex items-start justify-between mb-2">
        <IssueTitle>{issue.description}</IssueTitle>
        <SeverityBadge severity={issue.severity}>
          {issue.severity.toUpperCase()}
        </SeverityBadge>
      </div>

      {/* Occurrence navigator */}
      {hasMultiple && (
        <div className="flex items-center gap-2 mb-2">
          <NavButton onClick={handlePrev} disabled={occIdx === 0}>
            &lt;
          </NavButton>
          <NavLabel>
            {occIdx + 1}/{occurrences.length}
          </NavLabel>
          <NavButton onClick={handleNext} disabled={occIdx === occurrences.length - 1}>
            &gt;
          </NavButton>
        </div>
      )}

      <IssueMetrics>
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
      </IssueMetrics>

      {/* Linked recommendations */}
      {linkedRecs.length > 0 && (
        <LinkedRecBorder>
          {linkedRecs.map(rec => (
            <LinkedRecLink
              key={rec.id}
              onClick={(e) => {
                e.stopPropagation()
                onNavigateToRec(rec.id)
              }}
            >
              Fix: {rec.title}
            </LinkedRecLink>
          ))}
        </LinkedRecBorder>
      )}
    </IssueCardWrapper>
  )
})

/**
 * Format a change with direction arrow and value transition
 */
function ChangeDisplay({ change, pidProfile, filterSettings }: {
  change: ParameterChange
  pidProfile?: PidProfile
  filterSettings?: FilterSettings
}) {
  const displayName = PARAMETER_DISPLAY_NAMES[change.parameter] ?? change.parameter
  const axisLabel = change.axis ? ` (${change.axis.charAt(0).toUpperCase() + change.axis.slice(1)})` : ''
  const cliName = getCliName(change.parameter, change.axis as Axis | undefined)

  const { current, resolved } = computeTransition(change, pidProfile, filterSettings)

  // Determine direction
  const isIncrease = resolved !== null && current !== undefined && resolved > current
  const isDecrease = resolved !== null && current !== undefined && resolved < current

  return (
    <li className="text-sm">
      <div className="flex items-baseline gap-2 flex-wrap">
        <ChangeParamName>
          {displayName}{axisLabel}
        </ChangeParamName>
        {current !== undefined && resolved !== null ? (
          <span className="flex items-center gap-1">
            <ChangeValue direction={isIncrease ? 'increase' : isDecrease ? 'decrease' : 'neutral'}>
              {isIncrease ? '\u2191' : isDecrease ? '\u2193' : ''} {current} → {resolved}
            </ChangeValue>
          </span>
        ) : (
          <ChangeFallback>
            {change.recommendedChange}
          </ChangeFallback>
        )}
      </div>
      <p className="mt-0.5">
        <CliSnippet>set {cliName} = {resolved ?? change.recommendedChange}</CliSnippet>
      </p>
    </li>
  )
}

const RecommendationCard = observer(
  ({ recommendation, pidProfile, filterSettings }: {
    recommendation: Recommendation
    pidProfile?: Parameters<typeof getPidValue>[0]
    filterSettings?: Parameters<typeof getGlobalValue>[2]
  }) => {
    const analysisStore = useAnalysisStore()
    const uiStore = useUIStore()
    const isHighlighted = analysisStore.selectedRecommendationId === recommendation.id

    // Collect all linked issue IDs (primary + related)
    const linkedIssueIds = useMemo(() => {
      const ids: string[] = []
      if (recommendation.issueId) ids.push(recommendation.issueId)
      if (recommendation.relatedIssueIds) {
        for (const id of recommendation.relatedIssueIds) {
          if (!ids.includes(id)) ids.push(id)
        }
      }
      return ids
    }, [recommendation.issueId, recommendation.relatedIssueIds])

    const navigateToIssue = useCallback((issueId: string) => {
      analysisStore.selectIssue(issueId, 0)
      uiStore.setActiveRightTab('issues')
    }, [analysisStore, uiStore])

    return (
      <RecCardWrapper
        data-rec-id={recommendation.id}
        isHighlighted={isHighlighted}
        className={isHighlighted ? 'attention-pulse selected-item' : ''}
      >
        <div className="flex items-start justify-between mb-2">
          <RecTitle>{recommendation.title}</RecTitle>
          <div className="flex items-center gap-2">
            <PriorityBadge>
              Priority: {recommendation.priority}
            </PriorityBadge>
            <ConfidenceLabel>
              {(recommendation.confidence * 100).toFixed(0)}%
            </ConfidenceLabel>
          </div>
        </div>

        <RecDescription>
          {recommendation.description}
        </RecDescription>

        {/* Changes with human-readable names and magnitude indicators */}
        {recommendation.changes.length > 0 && (
          <ChangesBlock>
            <ChangesTitle>Recommended Changes:</ChangesTitle>
            <ul className="space-y-2">
              {recommendation.changes.map((change, idx) => (
                <ChangeDisplay
                  key={idx}
                  change={change}
                  pidProfile={pidProfile}
                  filterSettings={filterSettings}
                />
              ))}
            </ul>
          </ChangesBlock>
        )}

        {/* Rationale */}
        <div className="mb-2">
          <RationaleLabel>Why this helps</RationaleLabel>
          <RationaleText>{recommendation.rationale}</RationaleText>
        </div>

        {/* Expected Improvement */}
        <ExpectedBlock>
          <ExpectedText>
            <span className="font-medium">Expected:</span>{' '}
            {recommendation.expectedImprovement}
          </ExpectedText>
        </ExpectedBlock>

        {/* Risks */}
        {recommendation.risks.length > 0 && (
          <RisksSection>
            <RisksSummary>
              <RiskDot />
              Risks ({recommendation.risks.length})
            </RisksSummary>
            <RiskList>
              {recommendation.risks.map((risk, idx) => (
                <li key={idx}>{risk}</li>
              ))}
            </RiskList>
          </RisksSection>
        )}

        {/* Linked Issues */}
        {linkedIssueIds.length > 0 && (
          <LinkedIssuesSection>
            <LinkedIssuesSummary>
              Based on {linkedIssueIds.length} issue{linkedIssueIds.length !== 1 ? 's' : ''}
            </LinkedIssuesSummary>
            {linkedIssueIds.map(issueId => {
              const issue = analysisStore.issues.find(i => i.id === issueId)
              return (
                <LinkedIssueLink
                  key={issueId}
                  onClick={() => navigateToIssue(issueId)}
                >
                  {issue ? issue.description : issueId}
                </LinkedIssueLink>
              )
            })}
          </LinkedIssuesSection>
        )}
      </RecCardWrapper>
    )
  }
)
