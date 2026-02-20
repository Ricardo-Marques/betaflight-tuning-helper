import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useAnalysisStore } from '../stores/RootStore'
import { QUAD_SIZE_ORDER, QUAD_PROFILES } from '../domain/profiles/quadProfiles'
import { AnalysisLevel } from '../stores/AnalysisStore'
import { Tooltip } from './Tooltip'

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

  @media (pointer: coarse) {
    padding: 0.5rem;
  }
`

const HelpIconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  margin-left: 0.375rem;
  cursor: help;
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

const ANALYSIS_LEVELS: { id: AnalysisLevel; label: string; description: string }[] = [
  { id: 'basic', label: 'Basic', description: 'Relaxed - only flags clear problems' },
  { id: 'average', label: 'Average', description: 'Balanced - good starting point' },
  { id: 'expert', label: 'Expert', description: 'Strict - flags subtle issues' },
]

export const ProfileSelector = observer(() => {
  const analysisStore = useAnalysisStore()

  return (
    <>
      <SelectorWrapper>
        <SelectorHeader>
          <SelectorTitle>Quad Profile</SelectorTitle>
        </SelectorHeader>
        <ButtonGroup>
          {QUAD_SIZE_ORDER.map(sizeId => {
            const profile = QUAD_PROFILES[sizeId]
            const isActive = analysisStore.quadProfile.id === sizeId
            return (
              <Tooltip key={sizeId} text={profile.description}>
                <ProfileBtn
                  isActive={isActive}
                  onClick={() => analysisStore.setQuadProfile(sizeId)}
                >
                  {profile.label}
                </ProfileBtn>
              </Tooltip>
            )
          })}
        </ButtonGroup>
      </SelectorWrapper>
      <SelectorWrapper>
        <SelectorHeader>
          <SelectorTitle>
            Analysis Level
            <Tooltip text="Controls how sensitive the analysis is. Basic only flags obvious problems, Average is a good default, and Expert catches subtle issues too." maxWidth={200}>
              <HelpIconWrapper>
                <HelpIcon>?</HelpIcon>
              </HelpIconWrapper>
            </Tooltip>
          </SelectorTitle>
        </SelectorHeader>
        <ButtonGroup>
          {ANALYSIS_LEVELS.map(level => (
            <Tooltip key={level.id} text={level.description}>
              <ProfileBtn
                isActive={analysisStore.analysisLevel === level.id}
                onClick={() => analysisStore.setAnalysisLevel(level.id)}
              >
                {level.label}
              </ProfileBtn>
            </Tooltip>
          ))}
        </ButtonGroup>
      </SelectorWrapper>
    </>
  )
})
