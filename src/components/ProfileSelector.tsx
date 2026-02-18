import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useAnalysisStore } from '../stores/RootStore'
import { QUAD_SIZE_ORDER, QUAD_PROFILES } from '../domain/profiles/quadProfiles'
import { AnalysisLevel } from '../stores/AnalysisStore'

const SelectorWrapper = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
`

const SelectorHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`

const SelectorTitle = styled.h3`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.primary};
`

const DetectionBadge = styled.span<{ variant: 'good' | 'low' }>`
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  color: ${p => p.variant === 'good' ? p.theme.colors.accent.greenText : p.theme.colors.severity.mediumText};
  background-color: ${p => p.variant === 'good' ? p.theme.colors.accent.greenBg : p.theme.colors.severity.mediumBg};
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.25rem;
`

const ProfileBtn = styled.button<{ isActive: boolean }>`
  flex: 1;
  padding: 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
  border: none;
  cursor: pointer;
  color: ${p => p.isActive ? p.theme.colors.button.primaryText : p.theme.colors.text.secondary};
  background-color: ${p => p.isActive ? p.theme.colors.button.primary : p.theme.colors.background.section};

  &:hover {
    background-color: ${p => p.isActive ? p.theme.colors.button.primaryHover : p.theme.colors.button.secondaryHover};
  }
`

const ReasoningText = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  margin-top: 0.375rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const HelpIconWrapper = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 0.375rem;
  cursor: help;

  &:hover > [data-tooltip] {
    display: block;
  }
`

const HelpIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.muted};
  border: 1px solid ${p => p.theme.colors.text.muted};
  line-height: 1;
`

const HelpTooltip = styled.div`
  display: none;
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  width: 200px;
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
`

const ANALYSIS_LEVELS: { id: AnalysisLevel; label: string; description: string }[] = [
  { id: 'basic', label: 'Basic', description: 'Relaxed — only flags clear problems' },
  { id: 'average', label: 'Average', description: 'Balanced — good starting point' },
  { id: 'expert', label: 'Expert', description: 'Strict — flags subtle issues' },
]

export const ProfileSelector = observer(() => {
  const analysisStore = useAnalysisStore()
  const detection = analysisStore.detectionResult

  return (
    <>
      <SelectorWrapper>
        <SelectorHeader>
          <SelectorTitle>Quad Profile</SelectorTitle>
          {detection && detection.confidence >= 0.5 && (
            <DetectionBadge variant="good">Auto-detected</DetectionBadge>
          )}
          {detection && detection.confidence < 0.5 && (
            <DetectionBadge variant="low">Low confidence</DetectionBadge>
          )}
        </SelectorHeader>
        <ButtonGroup>
          {QUAD_SIZE_ORDER.map(sizeId => {
            const profile = QUAD_PROFILES[sizeId]
            const isActive = analysisStore.quadProfile.id === sizeId
            return (
              <ProfileBtn
                key={sizeId}
                isActive={isActive}
                onClick={() => analysisStore.setQuadProfile(sizeId)}
                title={profile.description}
              >
                {profile.label}
              </ProfileBtn>
            )
          })}
        </ButtonGroup>
        {detection && detection.reasoning.length > 0 && (
          <ReasoningText title={detection.reasoning.join('; ')}>
            {detection.reasoning[0]}
          </ReasoningText>
        )}
      </SelectorWrapper>
      <SelectorWrapper>
        <SelectorHeader>
          <SelectorTitle>
            Analysis Level
            <HelpIconWrapper>
              <HelpIcon>?</HelpIcon>
              <HelpTooltip data-tooltip>
                Controls how sensitive the analysis is. Basic only flags obvious problems, Average is a good default, and Expert catches subtle issues too.
              </HelpTooltip>
            </HelpIconWrapper>
          </SelectorTitle>
        </SelectorHeader>
        <ButtonGroup>
          {ANALYSIS_LEVELS.map(level => (
            <ProfileBtn
              key={level.id}
              isActive={analysisStore.analysisLevel === level.id}
              onClick={() => analysisStore.setAnalysisLevel(level.id)}
              title={level.description}
            >
              {level.label}
            </ProfileBtn>
          ))}
        </ButtonGroup>
      </SelectorWrapper>
    </>
  )
})
