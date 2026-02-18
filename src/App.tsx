import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { LeftPanel } from './components/LeftPanel'
import { LogChart } from './components/LogChart'
import { RecommendationsPanel } from './components/RecommendationsPanel'
import { FileUpload } from './components/FileUpload'
import { ThemeToggle } from './components/ThemeToggle'
import { ChangelogModal } from './components/ChangelogModal'
import { useUIStore, useLogStore, useAnalysisStore } from './stores/RootStore'
import { useObservableState } from './lib/mobx-reactivity'
import { getLastSeenBuild } from './lib/changelog/lastSeenBuild'
import changelogData from 'virtual:changelog'

const AppContainer = styled.div`
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: ${p => p.theme.colors.background.app};
  position: relative;
`

const Header = styled.header`
  background-color: ${p => p.theme.colors.background.header};
  color: ${p => p.theme.colors.text.inverse};
  padding: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  flex-shrink: 0;
`

const HeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`

const HeaderTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
`

const HeaderSubtitle = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.headerSubtle};
`

const MainContent = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
`

const PanelToggleBtn = styled.button`
  width: 1.5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${p => p.theme.colors.button.secondary};
  border: none;
  border-left: 1px solid ${p => p.theme.colors.border.main};
  border-right: 1px solid ${p => p.theme.colors.border.main};
  transition: background-color 0.15s;
  color: ${p => p.theme.colors.text.muted};
  font-size: 0.75rem;
  font-weight: 700;
  user-select: none;
  cursor: pointer;

  &:hover {
    background-color: ${p => p.theme.colors.button.secondaryHover};
  }
`

const ChartArea = styled.div`
  flex: 1;
  background-color: ${p => p.theme.colors.background.panel};
  min-width: 0;
`

const ReanalyzingOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  pointer-events: all;
`

const AnalysisOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  pointer-events: none;
`

const AnalysisOverlayCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  background-color: rgba(0, 0, 0, 0.6);
  padding: 1.5rem 2.5rem;
  border-radius: 0.75rem;
  min-width: 14rem;
`

const AnalysisOverlayText = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
`

const AnalysisOverlayTrack = styled.div`
  width: 100%;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  height: 0.375rem;
`

const AnalysisOverlayFill = styled.div<{ width: number }>`
  background-color: #fff;
  height: 0.375rem;
  border-radius: 9999px;
  transition: width 0.3s;
  width: ${p => p.width}%;
`

const ReanalyzingLabel = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.6);
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
`

const LeftPanelWrapper = styled.div`
  width: 20rem;
  flex-shrink: 0;
`

const RightPanelWrapper = styled.div`
  width: 480px;
  flex-shrink: 0;
  background-color: ${p => p.theme.colors.background.panel};
  border-left: 1px solid ${p => p.theme.colors.border.main};
`

const Footer = styled.footer`
  background-color: ${p => p.theme.colors.background.footer};
  color: ${p => p.theme.colors.text.muted};
  font-size: 0.75rem;
  padding: 0.5rem;
  text-align: center;
  flex-shrink: 0;
`

const FooterDivider = styled.span`
  margin: 0 0.5rem;
  opacity: 0.5;
`

const WhatsNewButton = styled.button`
  position: relative;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  transition: color 0.15s;

  &:hover {
    color: ${p => p.theme.colors.text.link};
  }
`

const NewDot = styled.span`
  position: absolute;
  top: -2px;
  right: -8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: ${p => p.theme.colors.accent.indigo};
  animation: attention-pulse 2s ease-in-out infinite;
`

const FullScreenUpload = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${p => p.theme.colors.background.panel};
`

const GlobalDropOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  pointer-events: none;
`

const DropOverlayText = styled.p`
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  background-color: ${p => p.theme.colors.button.primary};
  padding: 1.5rem 3rem;
  border-radius: 1rem;
  box-shadow: 0 10px 25px rgb(0 0 0 / 0.3);
`

export const App = observer(() => {
  const uiStore = useUIStore()
  const logStore = useLogStore()
  const analysisStore = useAnalysisStore()
  const [globalDragging, setGlobalDragging] = useObservableState(false)
  const dragCounter = { current: 0 }

  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setGlobalDragging(true)
    }
  }

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setGlobalDragging(false)
    }
  }

  const handleGlobalDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setGlobalDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      uiStore.setZoom(0, 100)
      logStore.uploadFile(files[0])
    }
  }

  const isLoaded = logStore.isLoaded

  return (
    <AppContainer
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {globalDragging && isLoaded && (
        <GlobalDropOverlay>
          <DropOverlayText>Drop file to load</DropOverlayText>
        </GlobalDropOverlay>
      )}

      <Header data-testid="app-header">
        <HeaderContent>
          <div>
            <TitleRow>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" width="28" height="28">
                <line x1="100" y1="100" x2="36" y2="36" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"/>
                <line x1="100" y1="100" x2="164" y2="36" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"/>
                <line x1="100" y1="100" x2="164" y2="164" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"/>
                <line x1="100" y1="100" x2="36" y2="164" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"/>
                <circle cx="36" cy="36" r="9" fill="#1e3a5f"/>
                <circle cx="164" cy="36" r="9" fill="#1e3a5f"/>
                <circle cx="164" cy="164" r="9" fill="#1e3a5f"/>
                <circle cx="36" cy="164" r="9" fill="#1e3a5f"/>
                <g>
                  <ellipse cx="36" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
                  <ellipse cx="36" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 36 36)"/>
                  <ellipse cx="36" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 36 36)"/>
                  <animateTransform attributeName="transform" type="rotate" from="0 36 36" to="360 36 36" dur="0.8s" repeatCount="indefinite"/>
                </g>
                <g>
                  <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
                  <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 164 36)"/>
                  <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 164 36)"/>
                  <animateTransform attributeName="transform" type="rotate" from="360 164 36" to="0 164 36" dur="0.7s" repeatCount="indefinite"/>
                </g>
                <g>
                  <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
                  <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 164 164)"/>
                  <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 164 164)"/>
                  <animateTransform attributeName="transform" type="rotate" from="0 164 164" to="360 164 164" dur="0.8s" repeatCount="indefinite"/>
                </g>
                <g>
                  <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
                  <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 36 164)"/>
                  <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 36 164)"/>
                  <animateTransform attributeName="transform" type="rotate" from="360 36 164" to="0 36 164" dur="0.7s" repeatCount="indefinite"/>
                </g>
                <rect x="72" y="64" width="56" height="72" rx="8" fill="#2563eb"/>
                <rect x="86" y="52" width="28" height="14" rx="3" fill="#334155" transform="rotate(0 100 59)"/>
                <circle cx="100" cy="59" r="5" fill="#1e293b" transform="rotate(-10 100 59)"/>
                <circle cx="100" cy="59" r="3" fill="#0f172a" transform="rotate(-10 100 59)"/>
                <circle cx="111" cy="54" r="2" fill="#ef4444" transform="rotate(-10 100 59)">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
                </circle>
              </svg>
              <HeaderTitle>Betaflight Tuning Helper</HeaderTitle>
            </TitleRow>
            <HeaderSubtitle>
              Analyze blackbox logs and get actionable tuning recommendations
            </HeaderSubtitle>
          </div>
          <ThemeToggle />
        </HeaderContent>
      </Header>

      {!isLoaded ? (
        <FullScreenUpload>
          <FileUpload />
        </FullScreenUpload>
      ) : (
        <MainContent>
          {analysisStore.isReanalyzing && (
            <ReanalyzingOverlay>
              <ReanalyzingLabel>Updating analysis...</ReanalyzingLabel>
            </ReanalyzingOverlay>
          )}
          {analysisStore.analysisStatus === 'analyzing' && !analysisStore.isReanalyzing && (
            <AnalysisOverlay>
              <AnalysisOverlayCard>
                <AnalysisOverlayText>{analysisStore.analysisMessage || 'Detecting issues...'}</AnalysisOverlayText>
                <AnalysisOverlayTrack>
                  <AnalysisOverlayFill width={analysisStore.analysisProgress} />
                </AnalysisOverlayTrack>
              </AnalysisOverlayCard>
            </AnalysisOverlay>
          )}
          {uiStore.leftPanelOpen && (
            <LeftPanelWrapper data-testid="left-panel">
              <LeftPanel />
            </LeftPanelWrapper>
          )}

          <PanelToggleBtn
            data-testid="toggle-left-panel"
            onClick={uiStore.toggleLeftPanel}
            title={uiStore.leftPanelOpen ? 'Collapse left panel' : 'Expand left panel'}
          >
            {uiStore.leftPanelOpen ? '\u2039' : '\u203A'}
          </PanelToggleBtn>

          <ChartArea>
            <LogChart />
          </ChartArea>

          <PanelToggleBtn
            data-testid="toggle-right-panel"
            onClick={uiStore.toggleRightPanel}
            title={uiStore.rightPanelOpen ? 'Collapse right panel' : 'Expand right panel'}
          >
            {uiStore.rightPanelOpen ? '\u203A' : '\u2039'}
          </PanelToggleBtn>

          {uiStore.rightPanelOpen && (
            <RightPanelWrapper data-testid="right-panel">
              <RecommendationsPanel />
            </RightPanelWrapper>
          )}
        </MainContent>
      )}

      <Footer>
        Betaflight Tuning Helper | Built for Betaflight 4.4/4.5
        <FooterDivider>|</FooterDivider>
        <WhatsNewButton onClick={uiStore.openChangelog}>
          What&apos;s New
          {getLastSeenBuild() !== changelogData.buildHash && <NewDot />}
        </WhatsNewButton>
      </Footer>
      <ChangelogModal />
    </AppContainer>
  )
})
