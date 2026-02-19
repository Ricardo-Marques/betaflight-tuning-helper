import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useObservableState } from '../lib/mobx-reactivity'
import { isSerialSupported } from '../serial/SerialPort'

export interface TuneChangeDetail {
  displayName: string
  cliName: string
  current: number | undefined
  newValue: number | null
  rawChange?: string
}

interface AcceptTuneModalProps {
  changes: TuneChangeDetail[]
  cliCommands: string
  onAccept: () => void
  onAcceptAndWrite: () => void
  onClose: () => void
}

/* ---- Styled Components ---- */

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
`

const ModalContainer = styled.div`
  position: relative;
  z-index: 201;
  max-width: 34rem;
  width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background-color: ${p => p.theme.colors.background.panel};
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
`

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.subtle};
  flex-shrink: 0;
`

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.heading};
  margin: 0;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: ${p => p.theme.colors.text.muted};
  font-size: 1.25rem;
  line-height: 1;

  &:hover {
    color: ${p => p.theme.colors.text.primary};
  }

  @media (pointer: coarse) {
    padding: 0.5rem;
    min-width: 2.75rem;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`

const ModalBody = styled.div`
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  flex: 1;
`

const SectionLabel = styled.h3`
  font-size: 0.8125rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0;
`

const ChangesTable = styled.div`
  display: flex;
  flex-direction: column;
`

const ChangeRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.375rem 0;
  font-size: 0.8125rem;

  & + & {
    border-top: 1px solid ${p => p.theme.colors.border.subtle};
  }
`

const ParamName = styled.span`
  font-weight: 500;
  color: ${p => p.theme.colors.text.heading};
  flex-shrink: 0;
`

const ValueTransition = styled.span`
  font-family: monospace;
  font-weight: 700;
  text-align: right;
`

const OldValue = styled.span`
  color: ${p => p.theme.colors.text.muted};
`

const Arrow = styled.span`
  color: ${p => p.theme.colors.text.muted};
  margin: 0 0.25rem;
`

const NewValue = styled.span<{ direction: 'increase' | 'decrease' | 'neutral' }>`
  color: ${p =>
    p.direction === 'increase'
      ? p.theme.colors.change.increase
      : p.direction === 'decrease'
        ? p.theme.colors.change.decrease
        : p.theme.colors.change.neutral};
`

const UnresolvedValue = styled.span`
  font-family: monospace;
  font-weight: 600;
  color: ${p => p.theme.colors.text.muted};
  font-style: italic;
`

const CliSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const CliHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const CliPreview = styled.pre`
  padding: 0.75rem;
  background-color: ${p => p.theme.colors.background.cliPreview};
  color: ${p => p.theme.colors.accent.green};
  font-size: 0.75rem;
  font-family: monospace;
  border-radius: 0.375rem;
  overflow-x: auto;
  max-height: 10rem;
  overflow-y: auto;
  margin: 0;
`

const CopyButton = styled.button<{ copied: boolean }>`
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s;
  color: ${p => p.theme.colors.button.primaryText};
  background-color: ${p => p.copied ? p.theme.colors.accent.green : p.theme.colors.accent.indigo};

  &:hover {
    opacity: 0.9;
  }

  @media (pointer: coarse) {
    padding: 0.5rem 0.75rem;
  }
`

const BodyText = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.secondary};
  line-height: 1.5;
  margin: 0;
`

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};
  gap: 0.5rem;
  flex-shrink: 0;
`

const ActionButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
  background-color: ${p =>
    p.variant === 'secondary'
      ? p.theme.colors.button.secondary
      : p.theme.colors.accent.green};
  color: ${p =>
    p.variant === 'secondary'
      ? p.theme.colors.text.primary
      : p.theme.colors.button.primaryText};

  &:hover {
    opacity: 0.9;
  }
`

const WriteButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
  background-color: ${p => p.theme.colors.accent.indigo};
  color: ${p => p.theme.colors.button.primaryText};

  &:hover {
    opacity: 0.9;
  }
`

/* ---- Component ---- */

export const AcceptTuneModal = observer(({
  changes,
  cliCommands,
  onAccept,
  onAcceptAndWrite,
  onClose,
}: AcceptTuneModalProps) => {
  const [copied, setCopied] = useObservableState(false)

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
  }

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(cliCommands)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // textarea is selectable as fallback
    }
  }

  const handleAccept = (): void => {
    onAccept()
    onClose()
  }

  const handleAcceptAndWrite = (): void => {
    onAcceptAndWrite()
    onClose()
  }

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer data-testid="accept-tune-modal">
        <ModalHeader>
          <ModalTitle>Accept Tune</ModalTitle>
          <CloseButton onClick={onClose} title="Close">&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          {/* Changes table */}
          <div>
            <SectionLabel>Changes</SectionLabel>
            <ChangesTable>
              {changes.map(c => {
                if (c.newValue === null) {
                  return (
                    <ChangeRow key={c.cliName}>
                      <ParamName>{c.displayName}</ParamName>
                      <UnresolvedValue>{c.rawChange ?? '?'} (needs import)</UnresolvedValue>
                    </ChangeRow>
                  )
                }
                const direction = c.current !== undefined
                  ? c.newValue > c.current ? 'increase' : c.newValue < c.current ? 'decrease' : 'neutral'
                  : 'neutral'
                return (
                  <ChangeRow key={c.cliName}>
                    <ParamName>{c.displayName}</ParamName>
                    <ValueTransition>
                      {c.current !== undefined ? (
                        <>
                          <OldValue>{c.current}</OldValue>
                          <Arrow>&rarr;</Arrow>
                          <NewValue direction={direction}>{c.newValue}</NewValue>
                        </>
                      ) : (
                        <NewValue direction="neutral">{c.newValue}</NewValue>
                      )}
                    </ValueTransition>
                  </ChangeRow>
                )
              })}
            </ChangesTable>
          </div>

          {/* CLI commands */}
          <CliSection>
            <CliHeader>
              <SectionLabel>CLI Commands</SectionLabel>
              <CopyButton copied={copied} onClick={() => void handleCopy()}>
                {copied ? 'Copied!' : 'Copy'}
              </CopyButton>
            </CliHeader>
            <CliPreview data-testid="cli-preview">{cliCommands}</CliPreview>
          </CliSection>

          {/* Explanation */}
          {isSerialSupported() ? (
            <BodyText>
              <strong>Accept &amp; Write to FC</strong> applies these changes
              directly to your flight controller via USB and saves your tune
              for the next session.{' '}
              <strong>Accept</strong> saves your tune without writing &mdash;
              copy and paste the commands into Betaflight CLI yourself.
            </BodyText>
          ) : (
            <BodyText>
              <strong>Accept</strong> saves your tune for the next session.
              Copy the commands above and paste them into the Betaflight CLI
              to apply the changes to your FC.
            </BodyText>
          )}
        </ModalBody>
        <ModalFooter>
          <ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton>
          {isSerialSupported() && (
            <WriteButton onClick={handleAcceptAndWrite}>
              Accept &amp; Write to FC
            </WriteButton>
          )}
          <ActionButton onClick={handleAccept}>Accept</ActionButton>
        </ModalFooter>
      </ModalContainer>
    </Backdrop>
  )
})
