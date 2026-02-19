import type { ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useUIStore } from '../stores/RootStore'
import type { MobileTab } from '../stores/UIStore'

interface TabDef {
  id: MobileTab
  label: string
  icon: ReactNode
}

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const UploadIcon = (): ReactNode => (
  <svg {...svgProps}>
    <path d="M8 11V3" />
    <polyline points="4.5,6.5 8,3 11.5,6.5" />
    <line x1="3" y1="14" x2="13" y2="14" />
  </svg>
)

const ChartIcon = (): ReactNode => (
  <svg {...svgProps}>
    <polyline points="1,11 4,5 7,9 10,3 15,8" />
  </svg>
)

const TuneIcon = (): ReactNode => (
  <svg {...svgProps}>
    <path d="M1 13 A7 7 0 0 1 15 13" />
    <line x1="8" y1="13" x2="8" y2="5" transform="rotate(25 8 13)" />
    <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const tabs: TabDef[] = [
  { id: 'upload', label: 'Upload', icon: <UploadIcon /> },
  { id: 'chart', label: 'Chart', icon: <ChartIcon /> },
  { id: 'tune', label: 'Tune', icon: <TuneIcon /> },
]

const TabBarContainer = styled.nav`
  display: flex;
  flex-shrink: 0;
  background-color: ${p => p.theme.colors.background.header};
  border-top: 1px solid ${p => p.theme.colors.border.main};
`

const TabButton = styled.button<{ active: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0.5rem 0;
  border: none;
  background: none;
  cursor: pointer;
  border-top: 3px solid ${p => p.active ? p.theme.colors.button.primary : 'transparent'};
  color: ${p => p.active ? p.theme.colors.text.inverse : p.theme.colors.text.headerSubtle};
  font-weight: ${p => p.active ? 700 : 400};
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: ${p => p.theme.colors.text.inverse};
  }
`

const TabIconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.25rem;
`

const TabLabel = styled.span`
  font-size: 0.625rem;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

export const BottomTabBar = observer(() => {
  const uiStore = useUIStore()

  return (
    <TabBarContainer>
      {tabs.map(tab => (
        <TabButton
          key={tab.id}
          active={uiStore.mobileActiveTab === tab.id}
          data-testid={`mobile-tab-${tab.id}`}
          onClick={() => uiStore.setMobileActiveTab(tab.id)}
        >
          <TabIconWrapper>{tab.icon}</TabIconWrapper>
          <TabLabel>{tab.label}</TabLabel>
        </TabButton>
      ))}
    </TabBarContainer>
  )
})
