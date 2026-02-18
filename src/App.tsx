import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { LeftPanel } from './components/LeftPanel'
import { LogChart } from './components/LogChart'
import { RecommendationsPanel } from './components/RecommendationsPanel'
import { ThemeToggle } from './components/ThemeToggle'
import { useUIStore } from './stores/RootStore'

const AppContainer = styled.div`
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: ${p => p.theme.colors.background.app};
`

const Header = styled.header`
  background-color: ${p => p.theme.colors.background.header};
  color: ${p => p.theme.colors.text.inverse};
  padding: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
`

const HeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
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
`

const PanelToggleBtn = styled.button`
  width: 1.5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${p => p.theme.colors.button.secondary};
  border-left: 1px solid ${p => p.theme.colors.border.main};
  border-right: 1px solid ${p => p.theme.colors.border.main};
  transition: background-color 0.15s;
  color: ${p => p.theme.colors.text.muted};
  font-size: 0.75rem;
  font-weight: 700;
  user-select: none;

  &:hover {
    background-color: ${p => p.theme.colors.button.secondaryHover};
  }
`

const ChartArea = styled.div`
  flex: 1;
  background-color: ${p => p.theme.colors.background.panel};
  min-width: 0;
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
`

export const App = observer(() => {
  const uiStore = useUIStore()

  return (
    <AppContainer>
      <Header data-testid="app-header">
        <HeaderContent>
          <div>
            <HeaderTitle>Betaflight Tuning Helper</HeaderTitle>
            <HeaderSubtitle>
              Analyze blackbox logs and get actionable tuning recommendations
            </HeaderSubtitle>
          </div>
          <ThemeToggle />
        </HeaderContent>
      </Header>

      <MainContent>
        {uiStore.leftPanelOpen && (
          <div data-testid="left-panel" className="w-80 flex-shrink-0">
            <LeftPanel />
          </div>
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

      <Footer>
        Betaflight Tuning Helper | Built for Betaflight 4.4/4.5
      </Footer>
    </AppContainer>
  )
})
