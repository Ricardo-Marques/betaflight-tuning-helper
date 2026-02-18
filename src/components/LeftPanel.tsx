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

const AnalysisSection = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
`

const ProgressTrack = styled.div`
  width: 100%;
  background-color: ${p => p.theme.colors.button.secondary};
  border-radius: 9999px;
  height: 0.5rem;
`

const ProgressFill = styled.div<{ width: number }>`
  background-color: ${p => p.theme.colors.button.primary};
  height: 0.5rem;
  border-radius: 9999px;
  transition: width 0.3s;
  width: ${p => p.width}%;
`

const ProgressMessage = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
  margin-top: 0.25rem;
  text-align: center;
`

const ReanalyzeBtn = styled.button`
  width: 100%;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
  transition: background-color 0.15s;
  border: none;
  cursor: pointer;
  color: ${p => p.theme.colors.button.secondaryText};
  background-color: ${p => p.theme.colors.button.secondary};

  &:hover {
    background-color: ${p => p.theme.colors.button.secondaryHover};
  }
`

const SegmentsWrapper = styled.div`
  padding: 1rem;
`

const SegmentsTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.75rem;
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
  font-size: 0.75rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.5rem;
`

const LogInfoText = styled.div`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};

  & > p + p {
    margin-top: 0.25rem;
  }
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

      {logStore.isLoaded && (
        <AnalysisSection>
          {analysisStore.analysisStatus === 'analyzing' && (
            <div>
              <ProgressTrack>
                <ProgressFill width={analysisStore.analysisProgress} />
              </ProgressTrack>
              <ProgressMessage>
                {analysisStore.analysisMessage}
              </ProgressMessage>
            </div>
          )}

          {analysisStore.isComplete && (
            <ReanalyzeBtn
              data-testid="reanalyze-button"
              onClick={() => analysisStore.analyze()}
            >
              Re-analyze
            </ReanalyzeBtn>
          )}
        </AnalysisSection>
      )}

      {logStore.isLoaded && <ProfileSelector />}

      {analysisStore.isComplete && analysisStore.segments.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <SegmentsWrapper>
            <SegmentsTitle>Flight Segments</SegmentsTitle>
            <div data-testid="flight-segments" className="space-y-2">
              {analysisStore.segments.map(segment => (
                <SegmentCard
                  key={segment.id}
                  data-testid={`segment-${segment.id}`}
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
            </div>
          </SegmentsWrapper>
        </div>
      )}

      {logStore.isLoaded && logStore.metadata && (
        <LogInfoSection data-testid="log-info">
          <LogInfoTitle>Log Info</LogInfoTitle>
          <LogInfoText>
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
              <span className="font-medium">Motors:</span> {logStore.metadata.motorCount}
            </p>
            {logStore.metadata.debugMode && (
              <p>
                <span className="font-medium">Debug:</span>{' '}
                {logStore.metadata.debugMode}
              </p>
            )}
          </LogInfoText>
        </LogInfoSection>
      )}
    </PanelContainer>
  )
})
