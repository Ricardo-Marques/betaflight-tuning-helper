import React from 'react'
import styled from '@emotion/styled'
import { CrashedDroneSvg } from './CrashedDroneSvg'

// All colors hardcoded from dark theme — this renders outside ThemeProvider

const CrashPage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #111827;
  padding: 2rem;
  gap: 1rem;
`

const Heading = styled.h1`
  color: #f3f4f6;
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
`

const Subtext = styled.p`
  color: #9ca3af;
  font-size: 0.95rem;
  max-width: 28rem;
  text-align: center;
  margin: 0;
  line-height: 1.5;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
`

const PrimaryButton = styled.button`
  background: #2563eb;
  color: #f3f4f6;
  border: none;
  border-radius: 6px;
  padding: 0.6rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #1d4ed8;
  }
`

const SecondaryButton = styled.button`
  background: #374151;
  color: #d1d5db;
  border: 1px solid #4b5563;
  border-radius: 6px;
  padding: 0.6rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: #4b5563;
  }
`

const ErrorDetails = styled.pre`
  background: #0f172a;
  color: #f87171;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  max-width: 36rem;
  max-height: 8rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  width: 100%;
  box-sizing: border-box;
`

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  copied: boolean
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    copied: false,
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Uncaught error:', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleCopy = async (): Promise<void> => {
    const { error } = this.state
    if (!error) return

    const text = `${error.name}: ${error.message}\n\n${error.stack ?? '(no stack trace)'}`
    try {
      await navigator.clipboard.writeText(text)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // Clipboard API may fail in some contexts — ignore
    }
  }

  render(): React.ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children
    }

    const { error, copied } = this.state

    return (
      <CrashPage>
        <CrashedDroneSvg />
        <Heading>Looks like we hit a tree!</Heading>
        <Subtext>
          Something went wrong and the app crashed. Try reloading — your log
          file will need to be loaded again.
        </Subtext>
        <ButtonRow>
          <PrimaryButton onClick={this.handleReload}>Reload App</PrimaryButton>
          <SecondaryButton onClick={this.handleCopy}>
            {copied ? 'Copied!' : 'Copy Error Details'}
          </SecondaryButton>
        </ButtonRow>
        <ErrorDetails>
          {error.name}: {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
        </ErrorDetails>
      </CrashPage>
    )
  }
}
