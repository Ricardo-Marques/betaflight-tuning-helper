import { observer } from 'mobx-react-lite'
import { useThemeStore } from '../stores/RootStore'
import styled from '@emotion/styled'

const ToggleButton = styled.button`
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
      title={themeStore.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
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
    </ToggleButton>
  )
})
