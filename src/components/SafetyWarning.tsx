import styled from '@emotion/styled'

const Container = styled.div`
  background: ${p => p.theme.colors.severity.highBg};
  border: 1px solid ${p => p.theme.colors.severity.high}44;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  margin-top: 2.5rem;
  text-align: left;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  color: ${p => p.theme.colors.severity.high};
  font-size: 0.875rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
`

const Subtitle = styled.p`
  margin: 0 0 0.5rem;
  color: ${p => p.theme.colors.severity.highText};
  font-size: 0.75rem;
  line-height: 1.5;
  text-align: center;
`

const BulletList = styled.ul`
  margin: 0;
  padding-left: 1.25rem;
  color: ${p => p.theme.colors.severity.highText};
  font-size: 0.75rem;
  line-height: 1.5;
`

const StyledLink = styled.a`
  color: ${p => p.theme.colors.severity.high};
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    opacity: 0.8;
  }
`

const Disclaimer = styled.p`
  margin: 0.625rem 0 0;
  color: ${p => p.theme.colors.severity.highText};
  font-size: 0.6875rem;
  font-weight: 700;
  text-align: center;
`

export function SafetyWarning(): React.ReactElement {
  return (
    <Container>
      <Header>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5L1 14h14L8 1.5z" />
          <path d="M8 6v4" />
          <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        Experimental Tool — Use With Caution
      </Header>
      <Subtitle>
        This tool is <strong>experimental</strong> and its suggestions may be incorrect.
        Applying bad tuning values can cause <strong>crashes, flyaways, or damage</strong> to your quad.
      </Subtitle>
      <BulletList>
        <li><strong>Do your own research</strong> — cross-reference every suggestion with trusted sources before applying</li>
        <li>Before making changes, <StyledLink href="https://www.betaflight.com/docs/development/Cli#dump-using-cli" target="_blank" rel="noopener noreferrer">save a <strong>CLI dump</strong></StyledLink> so you can restore your settings</li>
        <li>Test tuning changes <strong>outdoors in a wide open area</strong>, away from people and property</li>
        <li>Keep a safe distance and <strong>be ready to disarm</strong> at any moment</li>
        <li>Make <strong>small, incremental changes</strong></li>
      </BulletList>
      <Disclaimer>Use at your own risk. The authors accept no responsibility for any damage or injury.</Disclaimer>
    </Container>
  )
}
