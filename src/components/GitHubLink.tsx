import styled from '@emotion/styled'

const REPO_URL = 'https://github.com/Ricardo-Marques/betaflight-tuning-helper'

const Tooltip = styled.span`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
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

const LinkButton = styled.a`
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
  text-decoration: none;

  &:hover {
    background-color: rgba(255, 255, 255, 0.15);

    .github-tooltip {
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

export function GitHubLink(): JSX.Element {
  return (
    <LinkButton
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View on GitHub"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
      <Tooltip className="github-tooltip">View on GitHub</Tooltip>
    </LinkButton>
  )
}
