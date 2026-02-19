import { useRef } from 'react'
import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useAnalysisStore, useLogStore, useUIStore, useSettingsStore } from '../stores/RootStore'
import { Recommendation, DetectedIssue, ParameterChange } from '../domain/types/Analysis'
import { PidProfile, FilterSettings } from '../domain/types/LogFrame'
import {
  generateCliCommands,
  resolveAllChanges,
  getCliName,
  PARAMETER_DISPLAY_NAMES,
  resolveChange,
  getPidValue,
  getGlobalValue,
  isNoOpChange,
  isNoOpRecommendation,
} from '../domain/utils/CliExport'
import { useObservableState, useComputed, useAutorun } from '../lib/mobx-reactivity'
import { ISSUE_CHART_DESCRIPTIONS } from '../domain/issueChartDescriptions'
import { AcceptTuneModal } from './AcceptTuneModal'
import { shouldShowAcceptTuneConfirm } from '../lib/preferences/acceptTuneConfirm'

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
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): { current: number | undefined; resolved: number | null } {
  const isPerAxis = PER_AXIS_PID_PARAMS.has(change.parameter)
  const cliName = getCliName(change.parameter, change.axis)
  const current = change.currentValue
    ?? (isPerAxis
      ? getPidValue(pidProfile, change.parameter, change.axis)
      : getGlobalValue(change.parameter, pidProfile, filterSettings))
    ?? importedValues?.get(cliName)
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

const CliBarRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
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

const PreviewHint = styled.button`
  display: block;
  margin: 0 0.75rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  border: 1px dashed ${p => p.theme.colors.accent.indigo};
  background-color: ${p => p.theme.colors.accent.indigoBg};
  color: ${p => p.theme.colors.accent.indigoText};

  &:hover {
    background-color: ${p => p.theme.colors.accent.indigo}20;
  }
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
  font-weight: ${p => p.isActive ? 600 : 500};
  transition: color 0.15s;
  border: none;
  border-bottom: 2px solid ${p => p.isActive ? p.theme.colors.button.primary : 'transparent'};
  background: none;
  cursor: pointer;
  color: ${p => p.isActive ? p.theme.colors.text.link : p.theme.colors.text.muted};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;

  &:hover {
    color: ${p => p.isActive ? p.theme.colors.text.link : p.theme.colors.text.primary};
  }
`

const TabBadge = styled.span<{ isActive: boolean }>`
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
  background-color: ${p => p.isActive ? p.theme.colors.button.primary : p.theme.colors.background.section};
  color: ${p => p.isActive ? p.theme.colors.button.primaryText : p.theme.colors.text.muted};
`

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
`

const SummarySection = styled.div`
  padding: 1.25rem 1rem;
`

const SummaryTitle = styled.h2`
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
  color: ${p => p.theme.colors.text.secondary};
`

const HealthHero = styled.div<{ health: string }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  background-color: ${p => {
    switch (p.health) {
      case 'excellent': return p.theme.colors.health.excellentBg
      case 'good': return p.theme.colors.health.goodBg
      case 'needsWork': return p.theme.colors.health.needsWorkBg
      default: return p.theme.colors.health.criticalBg
    }
  }};
`

const HealthLabel = styled.span<{ health: string }>`
  font-size: 1.125rem;
  font-weight: 700;
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
  color: ${p => p.theme.colors.text.secondary};
`

const SeverityRow = styled.div`
  display: flex;
  gap: 0.75rem;
`

const SeverityChip = styled.div<{ severity: string }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  background-color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highBg
    : p.severity === 'medium' ? p.theme.colors.severity.mediumBg
    : p.theme.colors.severity.lowBg};
  color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highText
    : p.severity === 'medium' ? p.theme.colors.severity.mediumText
    : p.theme.colors.severity.lowText};
`

const SeverityDot = styled.span<{ severity: string }>`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.high
    : p.severity === 'medium' ? p.theme.colors.severity.medium
    : p.theme.colors.severity.low};
`

const PrioritiesSection = styled.div`
  padding: 1rem;
  margin: 0 0.75rem 0.75rem;
  border-radius: 0.5rem;
  background-color: ${p => p.theme.colors.accent.indigoBg};
`

const PrioritiesTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: ${p => p.theme.colors.accent.indigoText};
`

const PriorityList = styled.ol`
  list-style-type: decimal;
  list-style-position: inside;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};

  & > li + li {
    margin-top: 0.375rem;
  }

  & > li {
    line-height: 1.4;
  }
`

const SeverityGroup = styled.div`
  padding: 1rem;

  & + & {
    border-top: 1px solid ${p => p.theme.colors.border.subtle};
  }
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

/* ---- CLI Bar secondary row ---- */

const CliBarSecondaryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const CliTextButton = styled.button<{ color?: 'green' }>`
  font-size: 0.75rem;
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: ${p => p.color === 'green' ? p.theme.colors.accent.greenText : p.theme.colors.accent.indigo};

  &:hover {
    text-decoration: underline;
  }
`

const CliDot = styled.span`
  font-size: 0.5rem;
  color: ${p => p.theme.colors.text.muted};
`

const CliStatusText = styled.span`
  font-size: 0.6875rem;
  color: ${p => p.theme.colors.text.secondary};
`

const CliSuccessText = styled.button`
  font-size: 0.75rem;
  font-weight: 600;
  background: none;
  border: none;
  padding: 0;
  cursor: default;
  color: ${p => p.theme.colors.accent.greenText};
`

const AcceptTuneWrapper = styled.span`
  position: relative;
  display: inline-flex;

  &:hover > [data-tooltip] {
    display: block;
  }
`

const AcceptTuneTooltip = styled.div`
  display: none;
  position: absolute;
  left: 50%;
  top: calc(100% + 6px);
  transform: translateX(-50%);
  width: 180px;
  padding: 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 400;
  line-height: 1.4;
  color: ${p => p.theme.colors.text.primary};
  background-color: ${p => p.theme.colors.chart.tooltipBg};
  border: 1px solid ${p => p.theme.colors.chart.tooltipBorder};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
  pointer-events: none;
  white-space: normal;
`

const IssueList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`

const RecList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  text-transform: uppercase;
  flex-shrink: 0;
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
  font-weight: 600;
  font-size: 0.9375rem;
  color: ${p => p.theme.colors.text.primary};
  line-height: 1.3;
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
  padding-top: 0.375rem;
  margin-top: 0.25rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};

  & > p + p {
    margin-top: 0.125rem;
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
  width: fit-content;
  max-width: 100%;
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

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`

const OccurrenceNav = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`

const MetricLabel = styled.span`
  font-weight: 500;
`

const ChartHintToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding: 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.link};
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
  }
`

const ChartHintChevron = styled.span<{ expanded: boolean }>`
  display: inline-block;
  transition: transform 0.15s;
  transform: rotate(${p => p.expanded ? '90deg' : '0deg'});
`

const ChartHintText = styled.p`
  margin-top: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: ${p => p.theme.colors.text.secondary};
  padding-top: 0.375rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};
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
  white-space: nowrap;
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
  margin-top: 0.25rem;
  padding-left: 0.875rem;

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

const RecCardHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
`

const RecBadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  white-space: nowrap;
`

const ChangesList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const RationaleBlock = styled.div`
  margin-bottom: 0.5rem;
`

const ExpectedLabel = styled.span`
  font-weight: 500;
`

/* ---- Change Display ---- */

const ChangeItem = styled.li`
  font-size: 0.8125rem;
  padding: 0.375rem 0;

  & + & {
    border-top: 1px solid ${p => p.theme.colors.border.subtle};
  }
`

const ChangeRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
`

const ValueTransition = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`

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

/* ---- Main Panel Component ---- */

export const RecommendationsPanel = observer(() => {
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const settingsStore = useSettingsStore()
  const [copied, setCopied] = useObservableState(false)
  const [cliExpanded, setCliExpanded] = useObservableState(false)
  const [tuneAccepted, setTuneAccepted] = useObservableState(false)
  const [showAcceptModal, setShowAcceptModal] = useObservableState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const pidProfile = logStore.metadata?.pidProfile
  const filterSettings = logStore.metadata?.filterSettings

  const cliCommands = useComputed(() => {
    if (!analysisStore.isComplete) return ''
    const { recommendations } = analysisStore.result!
    // Access .size to ensure MobX tracks changes to baselineValues
    void settingsStore.baselineValues.size
    return generateCliCommands(recommendations, pidProfile, filterSettings, settingsStore.baselineValues)
  })

  const commandCount = useComputed(() => {
    return (cliCommands.match(/^set /gm) || []).length
  })

  const unresolvedCount = useComputed(() => {
    return (cliCommands.match(/current value unknown/gm) || []).length
  })

  // Group issues by severity
  const issuesBySeverity = useComputed(() => {
    const groups: Record<string, DetectedIssue[]> = {}
    for (const issue of analysisStore.issues) {
      const sev = issue.severity
      if (!groups[sev]) groups[sev] = []
      groups[sev].push(issue)
    }
    return groups
  })

  // Auto-scroll to selected issue (wait for Issues tab to render)
  useAutorun(() => {
    const id = analysisStore.selectedIssueId
    if (!id || !scrollRef.current || uiStore.activeRightTab !== 'issues') return
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-issue-id="${id}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  })

  const navigateToRec = (recId: string) => {
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
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliCommands)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text for manual copy
    }
  }

  const handleAcceptTune = () => {
    if (!analysisStore.isComplete) return
    const { recommendations } = analysisStore.result!
    const resolved = resolveAllChanges(recommendations, pidProfile, filterSettings, settingsStore.baselineValues)
    settingsStore.acceptResolvedValues(resolved)
    setTuneAccepted(true)
    setTimeout(() => setTuneAccepted(false), 2000)
  }

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

  const actionableRecs = useComputed(() => {
    void settingsStore.baselineValues.size
    return analysisStore.recommendations.filter(
      rec => !isNoOpRecommendation(rec, pidProfile, filterSettings, settingsStore.baselineValues)
    )
  })
  const recCount = actionableRecs.length

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
            <CliBarRow>
              <CliLabel>
                {commandCount} CLI command{commandCount !== 1 ? 's' : ''}
              </CliLabel>
              <CliBarRow>
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
              </CliBarRow>
            </CliBarRow>
            <CliBarSecondaryRow>
              <CliTextButton
                onClick={uiStore.openSettingsImport}
                data-testid="import-settings-button"
              >
                {settingsStore.hasImportedSettings ? 'Update settings' : 'Import settings'}
              </CliTextButton>
              {unresolvedCount > 0 && (
                <>
                  <CliDot>{'\u00b7'}</CliDot>
                  <CliStatusText>{unresolvedCount} need values</CliStatusText>
                </>
              )}
              {commandCount > 0 && unresolvedCount === 0 && (
                <>
                  <CliDot>{'\u00b7'}</CliDot>
                  {tuneAccepted ? (
                    <CliSuccessText>Accepted!</CliSuccessText>
                  ) : (
                    <AcceptTuneWrapper>
                      <CliTextButton
                        color="green"
                        onClick={() => shouldShowAcceptTuneConfirm() ? setShowAcceptModal(true) : handleAcceptTune()}
                        data-testid="accept-tune-button"
                      >
                        Accept tune
                      </CliTextButton>
                      <AcceptTuneTooltip data-tooltip>
                        Apply recommended values as your new baseline
                      </AcceptTuneTooltip>
                    </AcceptTuneWrapper>
                  )}
                </>
              )}
            </CliBarSecondaryRow>
          </CliBarInner>
          {cliExpanded && (
            <>
              <CliPreview>{cliCommands}</CliPreview>
              {unresolvedCount > 0 && (
                <PreviewHint onClick={uiStore.openSettingsImport}>
                  {unresolvedCount} command{unresolvedCount !== 1 ? 's are' : ' is'} commented out because the current values are unknown. Click Import Settings to paste your Betaflight CLI output and resolve them.
                </PreviewHint>
              )}
            </>
          )}
        </CliBar>
      )}

      {/* Tab Bar */}
      <TabBar>
        <Tab isActive={activeTab === 'summary'} onClick={() => uiStore.setActiveRightTab('summary')}>
          Summary
        </Tab>
        <Tab isActive={activeTab === 'issues'} onClick={() => uiStore.setActiveRightTab('issues')}>
          Issues
          {issueCount > 0 && <TabBadge isActive={activeTab === 'issues'}>{issueCount}</TabBadge>}
        </Tab>
        <Tab isActive={activeTab === 'fixes'} onClick={() => uiStore.setActiveRightTab('fixes')}>
          Fixes
          {recCount > 0 && <TabBadge isActive={activeTab === 'fixes'}>{recCount}</TabBadge>}
        </Tab>
      </TabBar>

      {/* Tab Content */}
      <TabContent ref={scrollRef}>
        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <>
            <SummarySection data-testid="analysis-summary">
              <SummaryTitle>Analysis Summary</SummaryTitle>
              <HealthHero health={summary.overallHealth}>
                <HealthLabel
                  data-testid="overall-health-badge"
                  health={summary.overallHealth}
                >
                  {summary.overallHealth === 'needsWork' ? 'NEEDS WORK' : summary.overallHealth.toUpperCase()}
                </HealthLabel>
                <ProfileLabel>({analysisStore.quadProfile.label})</ProfileLabel>
              </HealthHero>
              <SeverityRow>
                <SeverityChip severity="high">
                  <SeverityDot severity="high" />{summary.highIssueCount} High
                </SeverityChip>
                <SeverityChip severity="medium">
                  <SeverityDot severity="medium" />{summary.mediumIssueCount} Med
                </SeverityChip>
                <SeverityChip severity="low">
                  <SeverityDot severity="low" />{summary.lowIssueCount} Low
                </SeverityChip>
              </SeverityRow>
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
                  <IssueList key={analysisStore.selectedIssueId ?? ''} className={analysisStore.selectedIssueId ? 'dim-siblings' : undefined}>
                    {issues.map(issue => (
                      <IssueCard key={issue.id} issue={issue} onNavigateToRec={navigateToRec} />
                    ))}
                  </IssueList>
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
            <RecList key={analysisStore.selectedRecommendationId ?? ''} className={analysisStore.selectedRecommendationId ? 'dim-siblings' : undefined}>
              {actionableRecs.map(rec => (
                <RecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  pidProfile={pidProfile}
                  filterSettings={filterSettings}
                  importedValues={settingsStore.baselineValues}
                />
              ))}
            </RecList>
            {recCount === 0 && (
              <NoItemsText>
                <p>No recommendations</p>
              </NoItemsText>
            )}
          </FixesSection>
        )}
      </TabContent>

      {showAcceptModal && (
        <AcceptTuneModal
          onAccept={handleAcceptTune}
          onClose={() => setShowAcceptModal(false)}
        />
      )}
    </PanelWrapper>
  )
})

const IssueCard = observer(({ issue, onNavigateToRec }: { issue: DetectedIssue; onNavigateToRec: (recId: string) => void }) => {
  const analysisStore = useAnalysisStore()
  const uiStore = useUIStore()
  const logStore = useLogStore()
  const [occIdx, setOccIdx] = useObservableState(0)
  const [chartHintOpen, setChartHintOpen] = useObservableState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Sync local occurrence index when selected externally (e.g. clicking chart pill)
  const isSelected = analysisStore.selectedIssueId === issue.id

  // Restart pulse animation on re-selection of the same issue
  useAutorun(() => {
    void analysisStore.selectionBump
    if (analysisStore.selectedIssueId === issue.id && cardRef.current) {
      const el = cardRef.current
      el.classList.remove('attention-pulse')
      void el.offsetWidth
      el.classList.add('attention-pulse')
    }
  })
  useAutorun(() => {
    const storeOccIdx = analysisStore.selectedOccurrenceIdx
    if (analysisStore.selectedIssueId === issue.id && storeOccIdx != null && storeOccIdx !== occIdx) {
      setOccIdx(storeOccIdx)
    }
  })

  const occurrences = issue.occurrences ?? [issue.timeRange]
  const hasMultiple = occurrences.length > 1
  const linkedRecs = analysisStore.getRecommendationsForIssue(issue.id)

  const zoomToOccurrence = (idx: number) => {
    analysisStore.selectIssue(issue.id, idx)

    const frames = logStore.frames
    if (frames.length > 0) {
      const tr = occurrences[idx]
      const occTime = issue.peakTimes?.[idx] ?? issue.metrics.peakTime ?? (tr[0] + tr[1]) / 2

      // Check if this occurrence is already visible in the current view
      const startFrame = Math.floor((uiStore.zoomStart / 100) * frames.length)
      const endFrame = Math.min(frames.length - 1, Math.ceil((uiStore.zoomEnd / 100) * frames.length))
      const viewStart = frames[startFrame]?.time ?? 0
      const viewEnd = frames[endFrame]?.time ?? Infinity
      if (occTime >= viewStart && occTime <= viewEnd) return

      // Occurrence is off-screen - navigate to center it
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
  }

  const handleClick = () => {
    zoomToOccurrence(occIdx)
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = Math.max(0, occIdx - 1)
    setOccIdx(next)
    zoomToOccurrence(next)
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = Math.min(occurrences.length - 1, occIdx + 1)
    setOccIdx(next)
    zoomToOccurrence(next)
  }

  return (
    <IssueCardWrapper
      ref={cardRef}
      data-issue-id={issue.id}
      data-selected={isSelected || undefined}
      severity={issue.severity}
      isSelected={isSelected}
      onClick={handleClick}
      className={isSelected ? 'attention-pulse selected-item' : ''}
    >
      <CardHeader>
        <IssueTitle>{issue.description}</IssueTitle>
        <SeverityBadge severity={issue.severity}>
          {issue.severity.toUpperCase()}
        </SeverityBadge>
      </CardHeader>

      {/* Occurrence navigator */}
      {hasMultiple && (
        <OccurrenceNav>
          <NavButton onClick={handlePrev} disabled={occIdx === 0}>
            &lt;
          </NavButton>
          <NavLabel>
            {occIdx + 1}/{occurrences.length}
          </NavLabel>
          <NavButton onClick={handleNext} disabled={occIdx === occurrences.length - 1}>
            &gt;
          </NavButton>
        </OccurrenceNav>
      )}

      <IssueMetrics>
        <p>
          <MetricLabel>Axis:</MetricLabel> {issue.axis}
        </p>
        {issue.metrics.overshoot !== undefined && (
          <p>
            <MetricLabel>Overshoot:</MetricLabel>{' '}
            {issue.metrics.overshoot.toFixed(1)}°
          </p>
        )}
        {issue.metrics.frequency !== undefined && (
          <p>
            <MetricLabel>Frequency:</MetricLabel>{' '}
            {issue.metrics.frequency.toFixed(1)} Hz
          </p>
        )}
        {issue.metrics.amplitude !== undefined && (
          <p>
            <MetricLabel>Amplitude:</MetricLabel>{' '}
            {issue.metrics.amplitude.toFixed(1)}°/s
          </p>
        )}
        <p>
          <MetricLabel>Confidence:</MetricLabel>{' '}
          {(issue.confidence * 100).toFixed(0)}%
        </p>
      </IssueMetrics>

      {/* Chart hint */}
      <ChartHintToggle
        onClick={(e) => {
          e.stopPropagation()
          setChartHintOpen(!chartHintOpen)
        }}
      >
        <ChartHintChevron expanded={chartHintOpen}>&#9656;</ChartHintChevron>
        What this looks like
      </ChartHintToggle>
      {chartHintOpen && (
        <ChartHintText>{ISSUE_CHART_DESCRIPTIONS[issue.type]}</ChartHintText>
      )}

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
function ChangeDisplay({ change, pidProfile, filterSettings, importedValues }: {
  change: ParameterChange
  pidProfile?: PidProfile
  filterSettings?: FilterSettings
  importedValues?: Map<string, number>
}) {
  if (isNoOpChange(change, pidProfile, filterSettings, importedValues)) return null

  const displayName = PARAMETER_DISPLAY_NAMES[change.parameter] ?? change.parameter
  const axisLabel = change.axis ? ` (${change.axis.charAt(0).toUpperCase() + change.axis.slice(1)})` : ''

  const { current, resolved } = computeTransition(change, pidProfile, filterSettings, importedValues)

  // Determine direction
  const isIncrease = resolved !== null && current !== undefined && resolved > current
  const isDecrease = resolved !== null && current !== undefined && resolved < current

  return (
    <ChangeItem>
      <ChangeRow>
        <ChangeParamName>
          {displayName}{axisLabel}
        </ChangeParamName>
        {current !== undefined && resolved !== null ? (
          <ValueTransition>
            <ChangeValue direction={isIncrease ? 'increase' : isDecrease ? 'decrease' : 'neutral'}>
              {current} {isIncrease ? '\u2192' : isDecrease ? '\u2192' : '\u2192'} {resolved} {isIncrease ? '\u2191' : isDecrease ? '\u2193' : ''}
            </ChangeValue>
          </ValueTransition>
        ) : (
          <ChangeFallback>
            {change.recommendedChange}
          </ChangeFallback>
        )}
      </ChangeRow>
    </ChangeItem>
  )
}

const RecommendationCard = observer(
  ({ recommendation, pidProfile, filterSettings, importedValues }: {
    recommendation: Recommendation
    pidProfile?: Parameters<typeof getPidValue>[0]
    filterSettings?: Parameters<typeof getGlobalValue>[2]
    importedValues?: Map<string, number>
  }) => {
    const analysisStore = useAnalysisStore()
    const uiStore = useUIStore()
    const isHighlighted = analysisStore.selectedRecommendationId === recommendation.id

    // Collect all linked issue IDs (primary + related)
    const linkedIssueIds = useComputed(() => {
      const ids: string[] = []
      if (recommendation.issueId) ids.push(recommendation.issueId)
      if (recommendation.relatedIssueIds) {
        for (const id of recommendation.relatedIssueIds) {
          if (!ids.includes(id)) ids.push(id)
        }
      }
      return ids
    })

    const navigateToIssue = (issueId: string) => {
      analysisStore.selectIssue(issueId, 0)
      uiStore.setActiveRightTab('issues')
    }

    return (
      <RecCardWrapper
        data-rec-id={recommendation.id}
        isHighlighted={isHighlighted}
        className={isHighlighted ? 'attention-pulse selected-item' : ''}
      >
        <RecCardHeader>
          <RecTitle>{recommendation.title}</RecTitle>
          <RecBadgeRow>
            <PriorityBadge>
              Priority: {recommendation.priority}
            </PriorityBadge>
            <ConfidenceLabel>
              {(recommendation.confidence * 100).toFixed(0)}%
            </ConfidenceLabel>
          </RecBadgeRow>
        </RecCardHeader>

        <RecDescription>
          {recommendation.description}
        </RecDescription>

        {/* Changes with human-readable names and magnitude indicators */}
        {recommendation.changes.length > 0 && (
          <ChangesBlock>
            <ChangesTitle>Recommended Changes:</ChangesTitle>
            <ChangesList>
              {recommendation.changes.map((change, idx) => (
                <ChangeDisplay
                  key={idx}
                  change={change}
                  pidProfile={pidProfile}
                  filterSettings={filterSettings}
                  importedValues={importedValues}
                />
              ))}
            </ChangesList>
          </ChangesBlock>
        )}

        {/* Rationale */}
        <RationaleBlock>
          <RationaleLabel>Why this helps</RationaleLabel>
          <RationaleText>{recommendation.rationale}</RationaleText>
        </RationaleBlock>

        {/* Expected Improvement */}
        <ExpectedBlock>
          <ExpectedText>
            <ExpectedLabel>Expected:</ExpectedLabel>{' '}
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
