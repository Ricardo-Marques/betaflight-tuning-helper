import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useSerialStore, useUIStore, useSettingsStore, useAnalysisStore, useLogStore } from '../stores/RootStore'
import { useComputed, useAutorun } from '../lib/mobx-reactivity'
import { generateGetScript } from '../domain/utils/GetScriptGenerator'
import { generateCliCommands } from '../domain/utils/CliExport'

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
  gap: 1rem;
`

const PhaseLabel = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.primary};
  margin: 0;
`

const ProgressTrack = styled.div`
  width: 100%;
  background-color: ${p => p.theme.colors.background.section};
  border-radius: 9999px;
  height: 0.5rem;
`

const ProgressFill = styled.div<{ width: number }>`
  background-color: ${p => p.theme.colors.accent.indigo};
  height: 0.5rem;
  border-radius: 9999px;
  transition: width 0.3s;
  width: ${p => p.width}%;
`

const CurrentCommand = styled.p`
  font-size: 0.75rem;
  font-family: monospace;
  color: ${p => p.theme.colors.text.muted};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SuccessText = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${p => p.theme.colors.accent.greenText};
  margin: 0;
`

const ErrorText = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.severity.highText};
  margin: 0;
`

const WarningList = styled.ul`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.accent.orangeText};
  margin: 0;
  padding-left: 1.25rem;

  & > li + li {
    margin-top: 0.25rem;
  }
`

const CommandPreview = styled.pre`
  max-height: 10rem;
  overflow-y: auto;
  padding: 0.75rem;
  background-color: ${p => p.theme.colors.background.cliPreview};
  color: ${p => p.theme.colors.accent.green};
  font-size: 0.75rem;
  font-family: monospace;
  border-radius: 0.375rem;
  margin: 0;
`

const WarningText = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.accent.orangeText};
  margin: 0;
  line-height: 1.4;
`

const EraseHint = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.secondary};
  margin: 0;
  line-height: 1.4;
`

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};
  gap: 0.5rem;
`

const ActionButton = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
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
      : p.variant === 'danger'
        ? p.theme.colors.severity.high
        : p.theme.colors.accent.indigo};
  color: ${p =>
    p.variant === 'secondary'
      ? p.theme.colors.text.primary
      : p.theme.colors.button.primaryText};

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

/* ---- Component ---- */

export const SerialProgressModal = observer(() => {
  const uiStore = useUIStore()
  const serialStore = useSerialStore()
  const settingsStore = useSettingsStore()
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()

  const pidProfile = logStore.metadata?.pidProfile
  const filterSettings = logStore.metadata?.filterSettings

  const cliCommands = useComputed(() => {
    if (!analysisStore.isComplete) return ''
    void settingsStore.baselineValues.size
    return generateCliCommands(
      analysisStore.result!.recommendations,
      pidProfile,
      filterSettings,
      settingsStore.baselineValues,
    )
  })

  const getScript = useComputed(() => {
    if (!analysisStore.isComplete) return ''
    return generateGetScript(
      analysisStore.result!.recommendations,
      pidProfile,
      filterSettings,
    )
  })

  // Auto-transition: when read completes, skip the success screen and go straight to review
  useAutorun(() => {
    if (
      uiStore.serialProgressOpen &&
      uiStore.serialProgressMode === 'read' &&
      serialStore.lastReadCount > 0 &&
      serialStore.progress >= 100 &&
      (serialStore.status === 'connected' || serialStore.status === 'disconnected')
    ) {
      uiStore.closeSerialProgress()
      uiStore.openSettingsReview()
    }
  })

  // Reset serial state when modal freshly opens (before auto-connect checks)
  useAutorun(() => {
    if (uiStore.serialProgressOpen) {
      serialStore.resetProgress()
    }
  })

  // Auto-connect when modal opens and we're not connected yet
  useAutorun(() => {
    if (
      uiStore.serialProgressOpen &&
      serialStore.status === 'disconnected' &&
      serialStore.progress === 0
    ) {
      void serialStore.connect()
    }
  })

  if (!uiStore.serialProgressOpen) return null

  const mode = uiStore.serialProgressMode
  const { status, progress, currentCommand, errorMessage } = serialStore
  const isOperating = status === 'reading' || status === 'writing' || status === 'saving'
  const isConnecting = status === 'connecting' || status === 'entering_cli'

  // Determine if we need to show the confirmation step
  const showWriteConfirm = mode === 'write' && status === 'connected' && serialStore.lastWriteCount === 0
  const showReadConfirm = mode === 'read' && status === 'connected' && serialStore.lastReadCount === 0

  // Success state (write only — read auto-transitions to review)
  const writeSuccess = mode === 'write' && (status === 'disconnected' || status === 'connected') && serialStore.lastWriteCount > 0 && progress >= 100

  const handleClose = (): void => {
    uiStore.closeSerialProgress()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && !isOperating && !isConnecting) handleClose()
  }

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget && !isOperating && !isConnecting) handleClose()
  }

  const handleStartRead = (): void => {
    void serialStore.readFromFC(getScript, settingsStore)
  }

  const handleStartWrite = (): void => {
    void serialStore.writeToFC(cliCommands)
  }

  const handleClearFlash = (): void => {
    uiStore.closeSerialProgress()
    uiStore.openFlashErase()
  }

  const handleRetry = (): void => {
    // If connection is lost, reconnect first — the auto-read/write
    // confirmation flow will handle the rest once connected
    if (!serialStore.isConnected) {
      serialStore.resetProgress()
      void serialStore.connect()
    } else if (mode === 'read') {
      handleStartRead()
    } else {
      handleStartWrite()
    }
  }

  const title = mode === 'read' ? 'Read Settings from FC' : 'Write Settings to FC'

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          {!isOperating && !isConnecting && (
            <CloseButton onClick={handleClose} title="Close">&times;</CloseButton>
          )}
        </ModalHeader>

        <ModalBody>
          {/* Connecting state */}
          {isConnecting && (
            <PhaseLabel>Connecting to FC...</PhaseLabel>
          )}

          {/* Read confirmation */}
          {showReadConfirm && (
            <PhaseLabel>
              Ready to read {getScript.split('\n').filter(l => l.startsWith('get ')).length} settings from FC.
            </PhaseLabel>
          )}

          {/* Write confirmation with preview */}
          {showWriteConfirm && !writeSuccess && (
            <>
              <PhaseLabel>
                {(cliCommands.match(/^set /gm) || []).length} commands will be sent to the FC:
              </PhaseLabel>
              <CommandPreview>{cliCommands}</CommandPreview>
              <WarningText>
                After applying, the FC will save and reboot. Make sure props are off.
              </WarningText>
            </>
          )}

          {/* Progress display */}
          {isOperating && (
            <>
              <PhaseLabel>
                {status === 'reading' && 'Reading settings...'}
                {status === 'writing' && 'Writing settings...'}
                {status === 'saving' && 'Saving & rebooting...'}
              </PhaseLabel>
              <ProgressTrack>
                <ProgressFill width={progress} />
              </ProgressTrack>
              {currentCommand && <CurrentCommand>{currentCommand}</CurrentCommand>}
            </>
          )}

          {/* Success (write only — read auto-transitions to review) */}
          {writeSuccess && (
            <>
              <SuccessText>
                Sent {serialStore.lastWriteCount} commands. FC is rebooting.
              </SuccessText>
              {serialStore.lastWriteErrors.length > 0 && (
                <WarningList>
                  {serialStore.lastWriteErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </WarningList>
              )}
              <EraseHint>
                Clear your old blackbox logs so your next flight reflects the new tune.
              </EraseHint>
            </>
          )}

          {/* Error */}
          {status === 'error' && (
            <ErrorText>{errorMessage}</ErrorText>
          )}
        </ModalBody>

        <ModalFooter>
          {/* Read confirm buttons */}
          {showReadConfirm && (
            <>
              <ActionButton variant="secondary" onClick={handleClose}>Cancel</ActionButton>
              <ActionButton onClick={handleStartRead}>Read from FC</ActionButton>
            </>
          )}

          {/* Write confirm buttons */}
          {showWriteConfirm && !writeSuccess && (
            <>
              <ActionButton variant="secondary" onClick={handleClose}>Cancel</ActionButton>
              <ActionButton variant="danger" onClick={handleStartWrite}>
                Write & Save
              </ActionButton>
            </>
          )}

          {/* Write success close */}
          {writeSuccess && (
            <>
              <ActionButton variant="secondary" onClick={handleClose}>Done</ActionButton>
              <ActionButton variant="danger" onClick={handleClearFlash}>
                Clear Blackbox Logs
              </ActionButton>
            </>
          )}

          {/* Error retry */}
          {status === 'error' && (
            <>
              <ActionButton variant="secondary" onClick={handleClose}>Close</ActionButton>
              <ActionButton onClick={handleRetry}>Retry</ActionButton>
            </>
          )}
        </ModalFooter>
      </ModalContainer>
    </Backdrop>
  )
})
