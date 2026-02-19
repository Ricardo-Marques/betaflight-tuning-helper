import styled from '@emotion/styled'

const Container = styled.div`
  background: ${p => p.theme.colors.severity.mediumBg};
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-top: 2.5rem;
  text-align: left;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  color: ${p => p.theme.colors.severity.medium};
  font-size: 0.8125rem;
  font-weight: 600;
  margin-bottom: 0.375rem;
`

const BulletList = styled.ul`
  margin: 0;
  padding-left: 1.25rem;
  color: ${p => p.theme.colors.severity.mediumText};
  font-size: 0.75rem;
  line-height: 1.5;
`

const StyledLink = styled.a`
  color: ${p => p.theme.colors.severity.medium};
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    opacity: 0.8;
  }
`

const Disclaimer = styled.p`
  margin: 0.5rem 0 0;
  color: ${p => p.theme.colors.severity.mediumText};
  font-size: 0.6875rem;
  font-weight: 600;
  text-align: center;
`

export function SafetyWarning(): React.ReactElement {
  return (
    <Container>
      <Header>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5L1 14h14L8 1.5z" />
          <path d="M8 6v4" />
          <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        Safety Notice
      </Header>
      <BulletList>
        <li>Before making changes, <StyledLink href="https://www.betaflight.com/docs/development/Cli#dump-using-cli" target="_blank" rel="noopener noreferrer">save a <strong>CLI dump</strong></StyledLink> so you can restore your settings if needed</li>
        <li>Suggestions are not expert advice - <strong>always verify</strong> before applying</li>
        <li>Test tuning changes <strong>outdoors in a wide open area</strong>, away from people and property</li>
        <li>Keep a safe distance and <strong>be ready to disarm</strong> at any moment</li>
        <li>Make <strong>small, incremental changes</strong></li>
      </BulletList>
      <Disclaimer>Use at your own risk. The authors accept no responsibility for any damage or injury.</Disclaimer>
    </Container>
  )
}
