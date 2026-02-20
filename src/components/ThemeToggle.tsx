import { observer } from 'mobx-react-lite'
import { useThemeStore } from '../stores/RootStore'
import styled from '@emotion/styled'

const Tooltip = styled.span`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  white-space: nowrap;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 400;
  line-height: 1.4;
  color: ${p => p.theme.colors.text.primary};
  background-color: ${p => p.theme.colors.chart.tooltipBg};
  border: 1px solid ${p => p.theme.colors.chart.tooltipBorder};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  opacity: 0;
  z-index: 1000;
  transition: opacity 0.15s;
`

const ToggleButton = styled.button`
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p => p.theme.colors.text.inverse};
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.15);

    .theme-tooltip {
      opacity: 1;
    }
  }

  svg {
    width: 22px;
    height: 22px;
  }

  @media (pointer: coarse) {
    min-width: 2.75rem;
    min-height: 2.75rem;
  }
`

export const ThemeToggle = observer(() => {
  const themeStore = useThemeStore()

  return (
    <ToggleButton
      onClick={themeStore.toggleTheme}
      aria-label="Toggle theme"
    >
      {themeStore.isDarkMode ? (
        // Sun icon
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        // Moon icon
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      <Tooltip className="theme-tooltip">{themeStore.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}</Tooltip>
    </ToggleButton>
  )
})
