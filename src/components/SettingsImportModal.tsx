import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useUIStore, useSettingsStore, useAnalysisStore, useLogStore } from '../stores/RootStore'
import { useObservableState, useComputed, useAutorun } from '../lib/mobx-reactivity'
import { generateGetScript } from '../domain/utils/GetScriptGenerator'
import { Tooltip } from './Tooltip'
import { isSerialSupported } from '../serial/SerialPort'

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
  max-width: 36rem;
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
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`

/* ---- Option Grid ---- */

const OptionGrid = styled.div`
  display: flex;
  gap: 0.75rem;
`

const OptionCard = styled.button<{ isActive?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0.75rem 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  border: 1.5px solid ${p =>
    p.isActive ? p.theme.colors.accent.indigo : p.theme.colors.border.main};
  background-color: ${p =>
    p.isActive ? p.theme.colors.accent.indigoBg : p.theme.colors.background.panel};

  &:hover {
    border-color: ${p => p.theme.colors.accent.indigo};
    background-color: ${p => p.theme.colors.accent.indigoBg};
  }
`

const OptionIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p => p.theme.colors.accent.indigoText};
`

const OptionLabel = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.heading};
`

const OptionHint = styled.span`
  font-size: 0.6875rem;
  color: ${p => p.theme.colors.text.muted};
`

/* ---- Manual Steps ---- */

const StepSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const StepLabel = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.heading};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const StepNumber = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
  background-color: ${p => p.theme.colors.accent.indigoBg};
  color: ${p => p.theme.colors.accent.indigoText};
`

const StepDescription = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.secondary};
  margin: 0;
  line-height: 1.4;
`

const ScriptTextarea = styled.textarea`
  width: 100%;
  min-height: 6rem;
  padding: 0.75rem;
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.375rem;
  font-family: monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  resize: vertical;
  background-color: ${p => p.theme.colors.background.cliPreview};
  color: ${p => p.theme.colors.accent.green};

  &:focus {
    outline: none;
    border-color: ${p => p.theme.colors.accent.indigo};
  }

  &[readonly] {
    cursor: default;
  }
`

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
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

const SuccessButton = styled(ActionButton)`
  background-color: ${p => p.theme.colors.accent.green};
`

const StatusLine = styled.p<{ isError?: boolean }>`
  font-size: 0.75rem;
  margin: 0;
  line-height: 1.4;
  color: ${p => p.isError ? p.theme.colors.severity.highText : p.theme.colors.accent.greenText};
`

const HintText = styled.p`
  font-size: 0.6875rem;
  color: ${p => p.theme.colors.text.muted};
  margin: 0;
  line-height: 1.4;
`

/* ---- Icons ---- */

const SavedIcon = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <polyline points="8,4 8,8 11,10" />
  </svg>
)

const UsbIcon = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="2" x2="8" y2="13" />
    <polyline points="5.5,10.5 8,13 10.5,10.5" />
    <circle cx="8" cy="2" r="1" fill="currentColor" stroke="none" />
    <path d="M8 5.5L11.5 3.5" />
    <rect x="11" y="2.5" width="2" height="2" />
    <path d="M8 8.5L4.5 6.5" />
    <circle cx="4" cy="6" r="1.25" />
  </svg>
)

const TerminalIcon = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="14" height="12" rx="2" />
    <polyline points="4.5,7 6.5,9 4.5,11" />
    <line x1="8.5" y1="11" x2="11.5" y2="11" />
  </svg>
)

/* ---- Component ---- */

export const SettingsImportModal = observer(() => {
  const uiStore = useUIStore()
  const settingsStore = useSettingsStore()
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()

  const [pasteText, setPasteText] = useObservableState('')
  const [copyStatus, setCopyStatus] = useObservableState<'idle' | 'copied'>('idle')
  const [importStatus, setImportStatus] = useObservableState<'idle' | 'done'>('idle')
  const [showManual, setShowManual] = useObservableState(false)

  const hasSaved = settingsStore.hasPendingSettings
  const hasUsb = isSerialSupported()

  // Reset state whenever the modal opens
  useAutorun(() => {
    if (uiStore.settingsImportOpen) {
      setPasteText('')
      setImportStatus('idle')
      // Auto-expand manual if it's the only option
      setShowManual(!hasSaved && !hasUsb)
    }
  })

  const pidProfile = logStore.metadata?.pidProfile
  const filterSettings = logStore.metadata?.filterSettings

  const getScript = useComputed(() => {
    if (!analysisStore.isComplete) return ''
    return generateGetScript(
      analysisStore.result!.recommendations,
      pidProfile,
      filterSettings,
    )
  })

  if (!uiStore.settingsImportOpen) return null

  const hasOptionGrid = hasSaved || hasUsb

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) uiStore.closeSettingsImport()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') uiStore.closeSettingsImport()
  }

  const handleCopyScript = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(getScript)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      // Fallback: textarea is already selectable
    }
  }

  const handleImport = (): void => {
    if (!pasteText.trim()) return
    settingsStore.importFromCliOutput(pasteText)
    setImportStatus('done')
    setTimeout(() => {
      uiStore.closeSettingsImport()
      uiStore.openSettingsReview()
    }, 600)
  }

  const lastResult = settingsStore.pendingParseResult

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>Import Current Settings</ModalTitle>
          <Tooltip text="Close"><CloseButton onClick={uiStore.closeSettingsImport} aria-label="Close">&times;</CloseButton></Tooltip>
        </ModalHeader>
        <ModalBody>
          {hasOptionGrid && (
            <OptionGrid>
              {hasSaved && (
                <OptionCard
                  data-testid="last-session-option"
                  onClick={() => {
                    uiStore.closeSettingsImport()
                    uiStore.openSettingsReview()
                  }}
                >
                  <OptionIcon><SavedIcon /></OptionIcon>
                  <OptionLabel>Last session</OptionLabel>
                  <OptionHint>{settingsStore.pendingCount} settings</OptionHint>
                </OptionCard>
              )}
              {hasUsb && getScript && (
                <OptionCard
                  onClick={() => {
                    uiStore.closeSettingsImport()
                    uiStore.openSerialProgress('read')
                  }}
                >
                  <OptionIcon><UsbIcon /></OptionIcon>
                  <OptionLabel>Read from FC</OptionLabel>
                  <OptionHint>via USB</OptionHint>
                </OptionCard>
              )}
              <OptionCard isActive={showManual} onClick={() => setShowManual(true)} data-testid="paste-cli-option">
                <OptionIcon><TerminalIcon /></OptionIcon>
                <OptionLabel>Paste CLI</OptionLabel>
                <OptionHint>manual</OptionHint>
              </OptionCard>
            </OptionGrid>
          )}

          {showManual && (
            <>
              {/* Step 1: Copy get script */}
              <StepSection>
                <StepLabel>
                  <StepNumber>1</StepNumber>
                  Copy this script into Betaflight CLI
                </StepLabel>
                <StepDescription>
                  Connect to Betaflight CLI and paste this script to read your current values.
                </StepDescription>
                <ScriptTextarea
                  readOnly
                  value={getScript || '# All parameters are already resolved!'}
                  data-testid="get-script-textarea"
                />
                <ButtonRow>
                  {copyStatus === 'copied' ? (
                    <SuccessButton>Copied!</SuccessButton>
                  ) : (
                    <ActionButton
                      onClick={handleCopyScript}
                      disabled={!getScript}
                      data-testid="copy-get-script-button"
                    >
                      Copy Script
                    </ActionButton>
                  )}
                </ButtonRow>
              </StepSection>

              {/* Step 2: Paste output */}
              <StepSection>
                <StepLabel>
                  <StepNumber>2</StepNumber>
                  Paste the CLI output here
                </StepLabel>
                <StepDescription>
                  Copy the output from Betaflight CLI and paste it below.
                </StepDescription>
                <ScriptTextarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste Betaflight CLI output here..."
                  data-testid="settings-paste-textarea"
                />
                <HintText>
                  You can also paste a full <code>dump</code> or <code>diff all</code> output.
                </HintText>
                <ButtonRow>
                  {importStatus === 'done' ? (
                    <SuccessButton>Imported!</SuccessButton>
                  ) : (
                    <ActionButton
                      onClick={handleImport}
                      disabled={!pasteText.trim()}
                      data-testid="import-settings-button"
                    >
                      Import
                    </ActionButton>
                  )}
                </ButtonRow>
                {lastResult && importStatus === 'done' && (
                  <>
                    <StatusLine>
                      Imported {lastResult.parsedCount} setting{lastResult.parsedCount !== 1 ? 's' : ''} — opening review...
                    </StatusLine>
                    {lastResult.warnings.map((w, i) => (
                      <StatusLine key={i} isError>{w}</StatusLine>
                    ))}
                  </>
                )}
              </StepSection>
            </>
          )}
        </ModalBody>
      </ModalContainer>
    </Backdrop>
  )
})
