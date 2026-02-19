import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useRef, useEffect } from 'react'
import { runInAction, reaction } from 'mobx'
import { LeftPanel } from './components/LeftPanel'
import { LogChart } from './components/LogChart'
import { RecommendationsPanel } from './components/RecommendationsPanel'
import { FileUpload } from './components/FileUpload'
import { ThemeToggle } from './components/ThemeToggle'
import { ChangelogModal } from './components/ChangelogModal'
import { SettingsImportModal } from './components/SettingsImportModal'
import { SettingsReviewModal } from './components/SettingsReviewModal'
import { SerialProgressModal } from './components/SerialProgressModal'
import { FlashDownloadModal } from './components/FlashDownloadModal'
import { BottomTabBar } from './components/BottomTabBar'
import { Toast } from './components/Toast'
import { useUIStore, useLogStore, useAnalysisStore } from './stores/RootStore'
import { useObservableState } from './lib/mobx-reactivity'
import { getLastSeenBuild } from './lib/changelog/lastSeenBuild'
import changelogData from 'virtual:changelog'
import { MIN_PANEL_WIDTH, MAX_PANEL_WIDTH } from './stores/UIStore'

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
  padding: 0.375rem 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const HeaderTitle = styled.h1`
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
`

const HeaderSubtitle = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.headerSubtle};
`

const MainContent = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
`

const ChartArea = styled.div`
  flex: 1;
  position: relative;
  background: linear-gradient(to bottom in oklab, ${p => p.theme.colors.background.panel}, ${p => p.theme.colors.background.appGradientEnd});
  min-width: 0;
  overflow: hidden;
`

const ChartAreaInner = styled.div`
  width: 100%;
  height: 100%;
`

const ResizeHandle = styled.div`
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background-color: ${p => p.theme.colors.background.app};
  transition: background-color 0.15s, width 0.15s;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover,
  &[data-dragging='true'] {
    background-color: ${p => p.theme.colors.border.main};
  }

  &[data-collapsed='true'] {
    width: 24px;
    cursor: pointer;
    background-color: ${p => p.theme.colors.button.secondary};
    border-left: 1px solid ${p => p.theme.colors.border.main};
    border-right: 1px solid ${p => p.theme.colors.border.main};

    &:hover {
      background-color: ${p => p.theme.colors.button.secondaryHover};
    }
  }
`

const HandleChevron = styled.span`
  font-size: 0.75rem;
  line-height: 1;
  color: ${p => p.theme.colors.text.muted};
  user-select: none;
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
  flex-shrink: 0;
  overflow: hidden;
`

const RightPanelWrapper = styled.div`
  flex-shrink: 0;
  overflow: hidden;
  background-color: ${p => p.theme.colors.background.panel};
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
  padding: 0.25rem 0.5rem;
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
  background: linear-gradient(to bottom in oklab, ${p => p.theme.colors.background.panel}, ${p => p.theme.colors.background.appGradientEnd});
`

const MobileContent = styled.div`
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
`

const MobileChartArea = styled.div`
  flex: 1;
  position: relative;
  background: linear-gradient(to bottom in oklab, ${p => p.theme.colors.background.panel}, ${p => p.theme.colors.background.appGradientEnd});
  min-height: 0;
  overflow: hidden;
`

const MobilePanelArea = styled.div`
  flex: 1;
  overflow: auto;
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

interface DragState {
  side: 'left' | 'right'
  originX: number
  originWidth: number
}

export const App = observer(() => {
  const uiStore = useUIStore()
  const logStore = useLogStore()
  const analysisStore = useAnalysisStore()
  const [globalDragging, setGlobalDragging] = useObservableState(false)
  const dragCounter = { current: 0 }

  // --- Resize handle drag logic (direct DOM during drag, commit to MobX on mouseup) ---
  // ChartArea stays flex:1 so the layout is always correct (no dead space).
  // ChartAreaInner is frozen at a fixed pixel width so Recharts' ResponsiveContainer
  // never fires its ResizeObserver. ChartArea's overflow:hidden clips any overshoot.
  const dragState = useRef<DragState | null>(null)
  const lastWidth = useRef(0)
  const leftHandleRef = useRef<HTMLDivElement>(null)
  const rightHandleRef = useRef<HTMLDivElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const chartInnerRef = useRef<HTMLDivElement>(null)

  const clampWidth = (w: number): number =>
    Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, w))

  const dragActivated = useRef(false)
  const DRAG_THRESHOLD = 5

  const activateDrag = (): void => {
    const state = dragState.current
    if (!state || dragActivated.current) return
    dragActivated.current = true
    const handle = state.side === 'left' ? leftHandleRef.current : rightHandleRef.current
    if (handle) handle.setAttribute('data-dragging', 'true')
    const inner = chartInnerRef.current
    if (inner) inner.style.width = inner.offsetWidth + 'px'
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handleResizeMove = (e: MouseEvent): void => {
    const state = dragState.current
    if (!state) return

    // Nothing happens until the mouse moves past the threshold
    if (!dragActivated.current) {
      if (Math.abs(e.clientX - state.originX) < DRAG_THRESHOLD) return
      activateDrag()
    }

    e.preventDefault()
    const delta = e.clientX - state.originX
    const raw = state.side === 'left'
      ? state.originWidth + delta
      : state.originWidth - delta
    const clamped = clampWidth(raw)
    lastWidth.current = clamped
    const panel = state.side === 'left' ? leftPanelRef.current : rightPanelRef.current
    if (panel) panel.style.width = clamped + 'px'
  }

  const handleResizeUp = (): void => {
    const state = dragState.current
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeUp)
    if (dragActivated.current) {
      const handle = state?.side === 'left' ? leftHandleRef.current : rightHandleRef.current
      if (handle) handle.removeAttribute('data-dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const inner = chartInnerRef.current
      if (inner) inner.style.width = ''
      const panel = state?.side === 'left' ? leftPanelRef.current : rightPanelRef.current
      if (panel) panel.style.width = ''
      if (state) {
        runInAction(() => {
          if (state.side === 'left') {
            uiStore.setLeftPanelWidth(lastWidth.current)
          } else {
            uiStore.setRightPanelWidth(lastWidth.current)
          }
        })
      }
    }
    dragState.current = null
  }

  const startResize = (side: 'left' | 'right', e: React.MouseEvent): void => {
    e.preventDefault()
    const originWidth = side === 'left' ? uiStore.leftPanelWidth : uiStore.rightPanelWidth
    dragState.current = { side, originX: e.clientX, originWidth }
    lastWidth.current = originWidth
    dragActivated.current = false
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeUp)
  }


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
  const isMobile = uiStore.isMobileLayout

  useEffect(() => reaction(
    () => logStore.isLoaded,
    (loaded) => {
      if (loaded && uiStore.isMobileLayout) {
        uiStore.setMobileActiveTab('chart')
      }
    },
  ), []) // eslint-disable-line react-hooks/exhaustive-deps

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
        <TitleRow>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" width="40" height="40">
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
              <animateTransform attributeName="transform" type="rotate" from="360 36 36" to="0 36 36" dur="0.8s" repeatCount="indefinite"/>
            </g>
            <g>
              <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
              <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 164 36)"/>
              <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 164 36)"/>
              <animateTransform attributeName="transform" type="rotate" from="0 164 36" to="360 164 36" dur="0.7s" repeatCount="indefinite"/>
            </g>
            <g>
              <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
              <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 164 164)"/>
              <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 164 164)"/>
              <animateTransform attributeName="transform" type="rotate" from="360 164 164" to="0 164 164" dur="0.8s" repeatCount="indefinite"/>
            </g>
            <g>
              <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85"/>
              <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 36 164)"/>
              <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 36 164)"/>
              <animateTransform attributeName="transform" type="rotate" from="0 36 164" to="360 36 164" dur="0.7s" repeatCount="indefinite"/>
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
          {!isMobile && <HeaderSubtitle>Analyze blackbox logs and get actionable tuning recommendations</HeaderSubtitle>}
        </TitleRow>
        <ThemeToggle />
      </Header>

      {!isLoaded ? (
        <FullScreenUpload>
          <FileUpload />
        </FullScreenUpload>
      ) : isMobile ? (
        <MobileContent>
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
          {uiStore.mobileActiveTab === 'upload' && <LeftPanel />}
          {uiStore.mobileActiveTab === 'chart' && (
            <MobileChartArea>
              <LogChart />
            </MobileChartArea>
          )}
          {uiStore.mobileActiveTab === 'tune' && (
            <MobilePanelArea>
              <RecommendationsPanel />
            </MobilePanelArea>
          )}
        </MobileContent>
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
            <LeftPanelWrapper
              ref={leftPanelRef}
              data-testid="left-panel"
              style={{ width: uiStore.leftPanelWidth }}
            >
              <LeftPanel />
            </LeftPanelWrapper>
          )}

          <ResizeHandle
            ref={leftHandleRef}
            data-testid="resize-left-panel"
            data-collapsed={!uiStore.leftPanelOpen}
            onMouseDown={e => uiStore.leftPanelOpen ? startResize('left', e) : undefined}
            onClick={() => !uiStore.leftPanelOpen && uiStore.toggleLeftPanel()}
            title={uiStore.leftPanelOpen ? 'Drag to resize left panel' : 'Open left panel'}
          >
            {!uiStore.leftPanelOpen && <HandleChevron>{'\u203A'}</HandleChevron>}
          </ResizeHandle>

          <ChartArea>
            <ChartAreaInner ref={chartInnerRef}>
              <LogChart />
            </ChartAreaInner>
          </ChartArea>

          <ResizeHandle
            ref={rightHandleRef}
            data-testid="resize-right-panel"
            data-collapsed={!uiStore.rightPanelOpen}
            onMouseDown={e => uiStore.rightPanelOpen ? startResize('right', e) : undefined}
            onClick={() => !uiStore.rightPanelOpen && uiStore.toggleRightPanel()}
            title={uiStore.rightPanelOpen ? 'Drag to resize right panel' : 'Open right panel'}
          >
            {!uiStore.rightPanelOpen && <HandleChevron>{'\u2039'}</HandleChevron>}
          </ResizeHandle>

          {uiStore.rightPanelOpen && (
            <RightPanelWrapper
              ref={rightPanelRef}
              data-testid="right-panel"
              style={{ width: uiStore.rightPanelWidth }}
            >
              <RecommendationsPanel />
            </RightPanelWrapper>
          )}
        </MainContent>
      )}

      {isMobile && isLoaded && <BottomTabBar />}

      {!(isMobile && isLoaded) && (
        <Footer>
          Betaflight Tuning Helper
          <FooterDivider>|</FooterDivider>
          Built for Betaflight 4.4/4.5
          <FooterDivider>|</FooterDivider>
          <WhatsNewButton onClick={uiStore.openChangelog}>
            What&apos;s New
            {getLastSeenBuild() !== changelogData.buildHash && <NewDot />}
          </WhatsNewButton>
        </Footer>
      )}
      <ChangelogModal />
      <SettingsImportModal />
      <SettingsReviewModal />
      <SerialProgressModal />
      <FlashDownloadModal />
      <Toast />
    </AppContainer>
  )
})
