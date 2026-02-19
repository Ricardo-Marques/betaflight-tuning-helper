import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useUIStore, useSettingsStore, useAnalysisStore, useLogStore } from '../stores/RootStore'
import { useObservableState, useComputed, useAutorun } from '../lib/mobx-reactivity'
import { generateGetScript } from '../domain/utils/GetScriptGenerator'

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
`

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`

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

/* ---- Component ---- */

export const SettingsImportModal = observer(() => {
  const uiStore = useUIStore()
  const settingsStore = useSettingsStore()
  const analysisStore = useAnalysisStore()
  const logStore = useLogStore()

  const [pasteText, setPasteText] = useObservableState('')
  const [copyStatus, setCopyStatus] = useObservableState<'idle' | 'copied'>('idle')
  const [importStatus, setImportStatus] = useObservableState<'idle' | 'done'>('idle')

  // Reset state whenever the modal opens
  useAutorun(() => {
    if (uiStore.settingsImportOpen) {
      setPasteText('')
      setImportStatus('idle')
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
    // Close import modal and open review modal after a brief delay
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
          <CloseButton onClick={uiStore.closeSettingsImport} title="Close">&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          {/* Step 1: Copy get script */}
          <StepSection>
            <StepLabel>
              <StepNumber>1</StepNumber>
              Copy this script into Betaflight CLI
            </StepLabel>
            <StepDescription>
              These settings should match your quad's configuration when this blackbox log was recorded. Connect to Betaflight CLI and paste this script.
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
        </ModalBody>
      </ModalContainer>
    </Backdrop>
  )
})
