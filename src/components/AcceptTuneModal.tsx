import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useObservableState } from '../lib/mobx-reactivity'
import { dismissAcceptTuneConfirm } from '../lib/preferences/acceptTuneConfirm'

interface AcceptTuneModalProps {
  onAccept: () => void
  onClose: () => void
}

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
  max-width: 28rem;
  width: 90vw;
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
`

const ModalBody = styled.div`
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`

const BodyText = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.primary};
  line-height: 1.5;
  margin: 0;
`

const WorkflowNote = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.muted};
  line-height: 1.5;
  margin: 0;
  font-style: italic;
`

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};
`

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  cursor: pointer;
  user-select: none;
`

const Checkbox = styled.input`
  cursor: pointer;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.5rem;
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

export const AcceptTuneModal = observer(({ onAccept, onClose }: AcceptTuneModalProps) => {
  const [dontShowAgain, setDontShowAgain] = useObservableState(false)

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
  }

  const handleAccept = (): void => {
    if (dontShowAgain) dismissAcceptTuneConfirm()
    onAccept()
    onClose()
  }

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>Accept Tune</ModalTitle>
          <CloseButton onClick={onClose} title="Close">&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          <BodyText>
            This saves the recommended values as your current settings.
            Next time you analyze a log, these will be used as the starting
            point instead of your quad&apos;s defaults.
          </BodyText>
          <WorkflowNote>
            The tuning workflow: apply these CLI commands &rarr; fly &rarr;
            record a new blackbox &rarr; analyze again to keep refining.
          </WorkflowNote>
        </ModalBody>
        <ModalFooter>
          <CheckboxLabel>
            <Checkbox
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
            />
            Don&apos;t show this again
          </CheckboxLabel>
          <ButtonGroup>
            <ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton>
            <ActionButton onClick={handleAccept}>Accept</ActionButton>
          </ButtonGroup>
        </ModalFooter>
      </ModalContainer>
    </Backdrop>
  )
})
