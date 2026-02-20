import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useUIStore, useSettingsStore, useAnalysisStore, useLogStore } from '../stores/RootStore'
import { getCliName, getPidValue, getGlobalValue } from '../domain/utils/CliExport'
import { ParameterChange } from '../domain/types/Analysis'
import { Tooltip } from './Tooltip'

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
  max-width: 30rem;
  width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`

const CountText = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.secondary};
  margin: 0;
`

const SettingsTable = styled.div`
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.375rem;
`

const SettingsRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;

  & + & {
    border-top: 1px solid ${p => p.theme.colors.border.subtle};
  }

  &:nth-of-type(even) {
    background-color: ${p => p.theme.colors.background.section};
  }
`

const ParamName = styled.span`
  font-family: monospace;
  font-weight: 500;
  color: ${p => p.theme.colors.text.primary};
`

const ParamValue = styled.span`
  font-family: monospace;
  font-weight: 700;
  color: ${p => p.theme.colors.accent.indigoText};
`

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};
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
      : p.theme.colors.accent.indigo};
  color: ${p =>
    p.variant === 'secondary'
      ? p.theme.colors.text.primary
      : p.theme.colors.button.primaryText};

  &:hover {
    opacity: 0.9;
  }
`

/* ---- Component ---- */

export const SettingsReviewModal = observer(() => {
  const uiStore = useUIStore()
  const settingsStore = useSettingsStore()
  const analysisStore = useAnalysisStore()

  const logStore = useLogStore()

  if (!uiStore.settingsReviewOpen || !settingsStore.hasPendingSettings) return null

  const PER_AXIS_PID = new Set(['pidPGain', 'pidIGain', 'pidDGain', 'pidDMinGain', 'pidFeedforward'])
  const pidProfile = logStore.metadata?.pidProfile
  const filterSettings = logStore.metadata?.filterSettings

  // Only show params needed by current recommendations that aren't already
  // available from the blackbox log
  const isAlreadyKnown = (change: ParameterChange): boolean => {
    if (change.currentValue !== undefined) return true
    if (PER_AXIS_PID.has(change.parameter)) {
      return getPidValue(pidProfile, change.parameter, change.axis) !== undefined
    }
    return getGlobalValue(change.parameter, pidProfile, filterSettings) !== undefined
  }

  const neededCliNames = new Set(
    analysisStore.recommendations
      .flatMap(r => r.changes)
      .filter(c => !isAlreadyKnown(c))
      .map(c => getCliName(c.parameter, c.axis))
  )

  const handleClose = (): void => {
    uiStore.closeSettingsReview()
  }

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) handleClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') handleClose()
  }

  const handleAccept = (): void => {
    settingsStore.acceptPending()
    uiStore.closeSettingsReview()
  }

  const entries = Array.from(settingsStore.pendingValues.entries())
    .filter(([name]) => neededCliNames.has(name))

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown} data-testid="settings-review-modal">
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>Review Imported Settings</ModalTitle>
          <Tooltip text="Close"><CloseButton onClick={handleClose} aria-label="Close">&times;</CloseButton></Tooltip>
        </ModalHeader>
        <ModalBody>
          <CountText data-testid="settings-review-count">
            {entries.length} tuning-relevant setting{entries.length !== 1 ? 's' : ''} ready to apply as your baseline
          </CountText>
          <SettingsTable>
            {entries.map(([name, value]) => (
              <SettingsRow key={name}>
                <ParamName>{name}</ParamName>
                <ParamValue>{value}</ParamValue>
              </SettingsRow>
            ))}
          </SettingsTable>
        </ModalBody>
        <ModalFooter>
          <ActionButton variant="secondary" onClick={handleClose} data-testid="settings-review-cancel">
            Cancel
          </ActionButton>
          <ActionButton onClick={handleAccept} data-testid="settings-review-accept">
            Accept
          </ActionButton>
        </ModalFooter>
      </ModalContainer>
    </Backdrop>
  )
})
