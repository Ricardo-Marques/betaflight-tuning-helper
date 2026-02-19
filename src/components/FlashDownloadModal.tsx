import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useFlashDownloadStore, useUIStore, useLogStore } from '../stores/RootStore'
import { useAutorun } from '../lib/mobx-reactivity'

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

const DownloadStats = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  margin: 0;
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

const LogListLabel = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.secondary};
  margin: 0;
`

const LogList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 20rem;
  overflow-y: auto;
`

const LogItem = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.5rem;
  background-color: transparent;
  cursor: ${p => p.disabled ? 'default' : 'pointer'};
  opacity: ${p => p.disabled ? 0.5 : 1};
  transition: background-color 0.15s, border-color 0.15s;
  text-align: left;

  &:hover:not(:disabled) {
    background-color: ${p => p.theme.colors.button.secondary};
    border-color: ${p => p.theme.colors.accent.indigo};
  }
`

const LogInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`

const LogName = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.primary};
`

const LogMeta = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
`

const LogSize = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.secondary};
  white-space: nowrap;
  margin-left: 1rem;
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

/* ---- Helpers ---- */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.ceil(seconds % 60)
  return `${mins}m ${secs}s`
}

/* ---- Component ---- */

export const FlashDownloadModal = observer(() => {
  const uiStore = useUIStore()
  const flashStore = useFlashDownloadStore()
  const logStore = useLogStore()

  const isEraseMode = uiStore.flashEraseMode

  // Auto-connect/erase when modal opens
  useAutorun(() => {
    if (uiStore.flashDownloadOpen && flashStore.status === 'idle') {
      if (isEraseMode) {
        void flashStore.eraseFlash()
      } else {
        void flashStore.connect()
      }
    }
  })

  // TODO: Re-enable auto-parse for single log after testing
  // useAutorun(() => {
  //   if (
  //     uiStore.flashDownloadOpen &&
  //     !isEraseMode &&
  //     flashStore.status === 'pick_log' &&
  //     flashStore.logs.length === 1
  //   ) {
  //     flashStore.selectAndParse(0, logStore)
  //     uiStore.closeFlashDownload()
  //   }
  // })

  if (!uiStore.flashDownloadOpen) return null

  const { status, errorMessage, logs } = flashStore
  const isDownloading = status === 'downloading'
  const showLogList = !isEraseMode && ((isDownloading && logs.length > 0) || (status === 'pick_log' && logs.length >= 1))

  const handleClose = (): void => {
    if (flashStore.isBusy) {
      flashStore.cancelDownload()
    }
    void flashStore.disconnect()
    uiStore.closeFlashDownload()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') handleClose()
  }

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) handleClose()
  }

  const handleRetry = (): void => {
    flashStore.reset()
    if (isEraseMode) {
      void flashStore.eraseFlash()
    } else {
      void flashStore.connect()
    }
  }

  const handleSelectLog = (index: number): void => {
    flashStore.selectAndParse(index, logStore)
    uiStore.closeFlashDownload()
  }

  const title = isEraseMode ? 'Clear Blackbox Logs' : 'Download from FC'

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <CloseButton onClick={handleClose} title="Close">&times;</CloseButton>
        </ModalHeader>

        <ModalBody>
          {/* Connecting */}
          {status === 'connecting' && (
            <PhaseLabel>Connecting to flight controller...</PhaseLabel>
          )}

          {/* Reading summary (download mode only) */}
          {status === 'reading_summary' && (
            <PhaseLabel>Reading flash info...</PhaseLabel>
          )}

          {/* Erasing */}
          {status === 'erasing' && (
            <PhaseLabel>{flashStore.eraseMessage || 'Erasing flash...'}</PhaseLabel>
          )}

          {/* Erase complete */}
          {status === 'erase_complete' && (
            <SuccessText>Blackbox logs cleared. Your next flight will start fresh.</SuccessText>
          )}

          {/* Downloading — progress bar */}
          {isDownloading && (
            <>
              <PhaseLabel>
                Scanning flash... {formatBytes(flashStore.bytesDownloaded)} / {formatBytes(flashStore.flashUsedSize)}
              </PhaseLabel>
              <ProgressTrack>
                <ProgressFill width={flashStore.downloadPercent} />
              </ProgressTrack>
              <DownloadStats>
                <span>{formatBytes(flashStore.speedBytesPerSec)}/s</span>
                {flashStore.estimatedSecondsRemaining > 0 && (
                  <span>~{formatEta(flashStore.estimatedSecondsRemaining)} remaining</span>
                )}
              </DownloadStats>
            </>
          )}

          {/* Log list — shown during download (growing) and in pick_log state */}
          {showLogList && (
            <>
              <LogListLabel>
                {isDownloading
                  ? `Found ${logs.length} log${logs.length > 1 ? 's' : ''} so far — click to select:`
                  : `Found ${logs.length} log${logs.length !== 1 ? 's' : ''} on flash. Select one to analyze:`}
              </LogListLabel>
              <LogList>
                {logs.map((log, i) => {
                  const selectable = flashStore.canSelectLog(i)
                  return (
                    <LogItem
                      key={log.index}
                      disabled={!selectable && isDownloading}
                      onClick={() => selectable && handleSelectLog(i)}
                    >
                      <LogInfo>
                        <LogName>Log {log.index}</LogName>
                        {log.craftName && <LogMeta>{log.craftName}</LogMeta>}
                        {log.firmwareVersion && <LogMeta>{log.firmwareVersion}</LogMeta>}
                      </LogInfo>
                      <LogSize>
                        {log.size > 0 ? formatBytes(log.size) : 'scanning...'}
                      </LogSize>
                    </LogItem>
                  )
                })}
              </LogList>
            </>
          )}

          {/* Error */}
          {status === 'error' && (
            <ErrorText>{errorMessage}</ErrorText>
          )}
        </ModalBody>

        <ModalFooter>
          {/* Cancel during download */}
          {isDownloading && (
            <ActionButton variant="secondary" onClick={handleClose}>
              Cancel
            </ActionButton>
          )}

          {/* Cancel during erase */}
          {status === 'erasing' && (
            <ActionButton variant="secondary" onClick={handleClose}>
              Cancel
            </ActionButton>
          )}

          {/* Erase complete */}
          {status === 'erase_complete' && (
            <ActionButton onClick={handleClose}>Done</ActionButton>
          )}

          {/* Log picker close */}
          {status === 'pick_log' && (
            <ActionButton variant="secondary" onClick={handleClose}>
              Cancel
            </ActionButton>
          )}

          {/* Error retry/close */}
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
