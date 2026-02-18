import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useStores } from '../stores/RootStore'
import { useObservableState } from '../lib/mobx-reactivity'

const UploadWrapper = styled.div`
  padding: 1rem;
  width: 100%;
  max-width: 32rem;
`

const Dropzone = styled.div<{ isDragging: boolean; compact?: boolean }>`
  border: 2px dashed ${p => p.isDragging ? p.theme.colors.border.focus : p.compact ? 'transparent' : p.theme.colors.border.main};
  border-radius: 0.5rem;
  padding: ${p => p.compact ? '0' : '2rem'};
  text-align: center;
  transition: border-color 0.15s, background-color 0.15s;
  background-color: ${p => p.isDragging ? p.theme.colors.severity.lowBg : 'transparent'};

  &:hover {
    border-color: ${p => p.compact ? 'transparent' : p.theme.colors.text.muted};
  }
`

const UploadIcon = styled.svg`
  margin: 0 auto 1rem;
  height: 3rem;
  width: 3rem;
  color: ${p => p.theme.colors.text.muted};
`

const IconWrapper = styled.div`
  margin-bottom: 1rem;
`

const UploadTitle = styled.p`
  font-size: 1.125rem;
  font-weight: 500;
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
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
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

const FormatHint = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  margin-top: 1rem;
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
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.link};
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
  }
`

export const FileUpload = observer(() => {
  const { logStore, uiStore, analysisStore } = useStores()
  const [isDragging, setIsDragging] = useObservableState(false)

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
    <UploadWrapper>
      <Dropzone
        data-testid="file-dropzone"
        isDragging={isDragging}
        compact={logStore.parseStatus === 'success'}
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
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
            <UploadButton htmlFor="file-upload">
              Select File
            </UploadButton>
            <FormatHint>
              Supports .bbl, .bfl, .txt, .csv (Betaflight Blackbox)
            </FormatHint>
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
            <LinkButton
              data-testid="upload-different-file"
              onClick={() => { logStore.reset(); analysisStore.reset(); uiStore.reset() }}
            >
              Upload different file
            </LinkButton>
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
