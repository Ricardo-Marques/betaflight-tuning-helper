import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useLogStore, useAnalysisStore, useUIStore } from '../stores/RootStore'
import { FileUpload } from './FileUpload'
import { ProfileSelector } from './ProfileSelector'

const PanelContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: ${p => p.theme.colors.background.panel};
  border-right: 1px solid ${p => p.theme.colors.border.main};
`

const SectionBorder = styled.div`
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
`

const SegmentsScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
`

const SegmentsWrapper = styled.div`
  padding: 1rem;
`

const SegmentsTitle = styled.h3`
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.text.muted};
  margin-bottom: 0.75rem;
`

const SegmentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const SegmentCard = styled.button<{ isSelected: boolean }>`
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  text-align: left;
  transition: background-color 0.15s;
  cursor: pointer;
  border: 2px solid ${p => p.isSelected ? p.theme.colors.border.focus : 'transparent'};
  background-color: ${p => p.isSelected ? p.theme.colors.background.selected : p.theme.colors.background.section};

  &:hover {
    background-color: ${p => p.isSelected ? p.theme.colors.background.selected : p.theme.colors.background.hover};
  }
`

const SegmentHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
`

const SegmentPhase = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  text-transform: capitalize;
  color: ${p => p.theme.colors.text.primary};
`

const IssueBadge = styled.span`
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  background-color: ${p => p.theme.colors.severity.highBg};
  color: ${p => p.theme.colors.severity.highText};
`

const SegmentDesc = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
`

const LogInfoSection = styled.div`
  padding: 1rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.background.section};
`

const LogInfoTitle = styled.h3`
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.text.muted};
  margin-bottom: 0.5rem;
`

const LogInfoText = styled.div`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};

  & > p + p {
    margin-top: 0.25rem;
  }
`

const InfoLabel = styled.span`
  font-weight: 500;
`

export const LeftPanel = observer(() => {
  const logStore = useLogStore()
  const analysisStore = useAnalysisStore()
  const uiStore = useUIStore()

  return (
    <PanelContainer>
      <SectionBorder>
        <FileUpload />
      </SectionBorder>

      {logStore.isLoaded && <ProfileSelector />}

      {analysisStore.isComplete && analysisStore.segments.length > 0 && (
        <SegmentsScrollArea>
          <SegmentsWrapper>
            <SegmentsTitle>Flight Segments</SegmentsTitle>
            <SegmentList data-testid="flight-segments">
              {analysisStore.segments.map(segment => (
                <SegmentCard
                  key={segment.id}
                  data-testid={`segment-${segment.id}`}
                  data-selected={analysisStore.selectedSegmentId === segment.id || undefined}
                  isSelected={analysisStore.selectedSegmentId === segment.id}
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
                >
                  <SegmentHeader>
                    <SegmentPhase>{segment.phase}</SegmentPhase>
                    {segment.issueCount > 0 && (
                      <IssueBadge>
                        {segment.issueCount} issue{segment.issueCount !== 1 ? 's' : ''}
                      </IssueBadge>
                    )}
                  </SegmentHeader>
                  <SegmentDesc>{segment.description}</SegmentDesc>
                </SegmentCard>
              ))}
            </SegmentList>
          </SegmentsWrapper>
        </SegmentsScrollArea>
      )}

      {logStore.isLoaded && logStore.metadata && (
        <LogInfoSection data-testid="log-info">
          <LogInfoTitle>Log Info</LogInfoTitle>
          <LogInfoText>
            <p>
              <InfoLabel>Firmware:</InfoLabel>{' '}
              {logStore.metadata.firmwareType} {logStore.metadata.firmwareVersion}
            </p>
            <p>
              <InfoLabel>Motors:</InfoLabel> {logStore.metadata.motorCount}
            </p>
            {logStore.metadata.debugMode && (
              <p>
                <InfoLabel>Debug:</InfoLabel>{' '}
                {logStore.metadata.debugMode}
              </p>
            )}
          </LogInfoText>
        </LogInfoSection>
      )}
    </PanelContainer>
  )
})
