import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useStores } from '../stores/RootStore'
import { useObservableState } from '../lib/mobx-reactivity'
import { SafetyWarning } from './SafetyWarning'

const UploadWrapper = styled.div<{ isIdle?: boolean }>`
  padding: 1rem;
  width: 100%;
  max-width: ${p => p.isIdle ? '40rem' : '32rem'};
`

const Dropzone = styled.div<{ isDragging: boolean; compact?: boolean; noBorder?: boolean }>`
  border: ${p => p.noBorder ? 'none' : `2px dashed ${p.isDragging ? p.theme.colors.border.focus : p.compact ? 'transparent' : p.theme.colors.border.main}`};
  border-radius: 0.75rem;
  padding: ${p => p.compact || p.noBorder ? '0' : '3rem 2rem'};
  text-align: center;
  transition: border-color 0.15s, background-color 0.15s;
  background-color: ${p => p.isDragging ? p.theme.colors.severity.lowBg : 'transparent'};

  &:hover {
    border-color: ${p => (p.compact || p.noBorder) ? 'transparent' : p.theme.colors.text.muted};
  }
`

const UploadIcon = styled.svg`
  margin: 0 auto 1rem;
  height: 4rem;
  width: 4rem;
  color: ${p => p.theme.colors.text.muted};
`

const IconWrapper = styled.div`
  margin-bottom: 1rem;
`

const UploadTitle = styled.p`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.5rem;
`

const UploadSubtext = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.muted};
  margin-bottom: 1rem;
`

const UploadButton = styled.label`
  display: inline-flex;
  align-items: center;
  padding: 0.625rem 1.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: 0.5rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  color: ${p => p.theme.colors.button.primaryText};
  background-color: ${p => p.theme.colors.button.primary};
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: ${p => p.theme.colors.button.primaryHover};
  }
`

const HiddenInput = styled.input`
  display: none;
`

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: center;
`

const SampleButton = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 0.625rem 1.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: 0.5rem;
  border: 1px solid ${p => p.theme.colors.border.main};
  color: ${p => p.theme.colors.text.secondary};
  background-color: transparent;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;

  &:hover {
    background-color: ${p => p.theme.colors.button.secondary};
    color: ${p => p.theme.colors.text.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const FormatHint = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  margin-top: 1rem;
`

const FeatureList = styled.div`
  display: flex;
  gap: 2rem;
  justify-content: center;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};
`

const FeatureItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  max-width: 9rem;
`

const FeatureIcon = styled.span`
  font-size: 1.25rem;
  line-height: 1;
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background-color: ${p => p.theme.colors.background.section};
  color: ${p => p.theme.colors.text.secondary};
`

const FeatureText = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
  text-align: center;
  line-height: 1.3;
`

const ProgressBarTrack = styled.div`
  width: 100%;
  background-color: ${p => p.theme.colors.button.secondary};
  border-radius: 9999px;
  height: 0.625rem;
  margin-bottom: 0.5rem;
`

const ProgressBarFill = styled.div<{ width: number }>`
  background-color: ${p => p.theme.colors.button.primary};
  height: 0.625rem;
  border-radius: 9999px;
  transition: width 0.3s;
  width: ${p => p.width}%;
`

const StatusText = styled.p`
  font-size: 1.125rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.primary};
  margin-bottom: 0.5rem;
`

const StatusSubtext = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.muted};
`

const Spinner = styled.div`
  margin: 0 auto;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  border: 2px solid transparent;
  border-bottom-color: #2563eb;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`

const ErrorIcon = styled.svg`
  margin: 0 auto 1rem;
  height: 3rem;
  width: 3rem;
  color: ${p => p.theme.colors.severity.high};
`

const ErrorTitle = styled.p`
  font-size: 1.125rem;
  font-weight: 500;
  color: ${p => p.theme.colors.severity.high};
  margin-bottom: 0.5rem;
`

const ErrorDetail = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.severity.high};
`

const MetadataBlock = styled.div`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
  text-align: left;

  & > p + p {
    margin-top: 0.25rem;
  }
`

const MetadataLabel = styled.span`
  font-weight: 500;
`

const LinkButton = styled.button`
  margin-top: 0.5rem;
  padding: 0;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.link};
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
  }
`

const ChangeFileButton = styled.button`
  margin-top: 0.75rem;
  padding: 0.375rem 0.875rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.button.primaryText};
  background-color: ${p => p.theme.colors.button.primary};
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: ${p => p.theme.colors.button.primaryHover};
  }
`

export const FileUpload = observer(() => {
  const { logStore, uiStore, analysisStore } = useStores()
  const [isDragging, setIsDragging] = useObservableState(false)
  const [loadingSample, setLoadingSample] = useObservableState(false)

  const handleLoadSample = async (): Promise<void> => {
    setLoadingSample(true)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.BFL`)
      const blob = await response.blob()
      const file = new File([blob], 'sample.BFL', { type: 'application/octet-stream' })
      uiStore.setZoom(0, 100)
      logStore.uploadFile(file)
    } finally {
      setLoadingSample(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      uiStore.setZoom(0, 100)
      logStore.uploadFile(files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      uiStore.setZoom(0, 100)
      logStore.uploadFile(files[0])
    }
  }

  return (
    <UploadWrapper isIdle={logStore.parseStatus === 'idle'}>
      <Dropzone
        data-testid="file-dropzone"
        isDragging={isDragging}
        compact={logStore.parseStatus === 'success'}
        noBorder={logStore.parseStatus === 'parsing'}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {logStore.parseStatus === 'idle' && (
          <>
            <IconWrapper>
              <UploadIcon
                stroke="currentColor"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 2v6h6M9 15h6M9 11h3"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 18l3-3M12 18l-3-3"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.5"
                />
              </UploadIcon>
            </IconWrapper>
            <UploadTitle>Drop blackbox log here</UploadTitle>
            <UploadSubtext>or click to browse</UploadSubtext>
            <HiddenInput
              type="file"
              accept=".bbl,.bfl,.txt,.csv"
              onChange={handleFileInput}
              id="file-upload"
            />
            <ButtonRow>
              <UploadButton htmlFor="file-upload">
                Select File
              </UploadButton>
              <SampleButton
                data-testid="load-sample-log"
                disabled={loadingSample}
                onClick={handleLoadSample}
              >
                {loadingSample ? 'Loading...' : 'Try sample log'}
              </SampleButton>
            </ButtonRow>
            <FormatHint>
              Supports .bbl, .bfl, .txt, .csv (Betaflight Blackbox)
            </FormatHint>
            <FeatureList>
              <FeatureItem>
                <FeatureIcon>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="1,12 4,5 7,8 10,2 15,7" />
                  </svg>
                </FeatureIcon>
                <FeatureText>Detect oscillations, noise &amp; bounceback</FeatureText>
              </FeatureItem>
              <FeatureItem>
                <FeatureIcon>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 14V6l4-4h4l4 4v8H2z" />
                    <path d="M6 14v-4h4v4" />
                  </svg>
                </FeatureIcon>
                <FeatureText>Get PID &amp; filter tuning recommendations</FeatureText>
              </FeatureItem>
              <FeatureItem>
                <FeatureIcon>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="12" height="10" rx="1" />
                    <path d="M5 7l2 2 4-4" />
                  </svg>
                </FeatureIcon>
                <FeatureText>Export ready-to-paste CLI commands</FeatureText>
              </FeatureItem>
            </FeatureList>
            <SafetyWarning />
          </>
        )}

        {logStore.parseStatus === 'parsing' && (
          <>
            <IconWrapper>
              <Spinner />
            </IconWrapper>
            <StatusText data-testid="parse-status-text">
              Parsing log...
            </StatusText>
            <ProgressBarTrack data-testid="parse-progress-bar">
              <ProgressBarFill width={logStore.parseProgress} />
            </ProgressBarTrack>
            <StatusSubtext>{logStore.parseMessage}</StatusSubtext>
          </>
        )}

        {logStore.parseStatus === 'success' && logStore.metadata && (
          <MetadataBlock data-testid="parse-success-text">
            <p>
              <MetadataLabel>Duration:</MetadataLabel>{' '}
              {logStore.metadata.duration.toFixed(1)}s
            </p>
            <p>
              <MetadataLabel>Loop Rate:</MetadataLabel>{' '}
              {(logStore.metadata.looptime / 1000).toFixed(1)}kHz
            </p>
            {logStore.metadata.craftName && (
              <p>
                <MetadataLabel>Craft:</MetadataLabel>{' '}
                {logStore.metadata.craftName}
              </p>
            )}
            <ChangeFileButton
              data-testid="upload-different-file"
              onClick={() => { logStore.reset(); analysisStore.reset(); uiStore.reset() }}
            >
              Upload different file
            </ChangeFileButton>
          </MetadataBlock>
        )}

        {logStore.parseStatus === 'error' && (
          <>
            <IconWrapper>
              <ErrorIcon
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </ErrorIcon>
            </IconWrapper>
            <ErrorTitle data-testid="parse-error-text">Parse failed</ErrorTitle>
            <ErrorDetail>{logStore.parseError}</ErrorDetail>
            <LinkButton
              onClick={() => { logStore.reset(); analysisStore.reset(); uiStore.reset() }}
            >
              Try again
            </LinkButton>
          </>
        )}
      </Dropzone>
    </UploadWrapper>
  )
})
