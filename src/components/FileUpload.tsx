import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useStores } from '../stores/RootStore'
import { useState, useCallback } from 'react'

const UploadWrapper = styled.div`
  padding: 1rem;
`

const Dropzone = styled.div<{ isDragging: boolean }>`
  border: 2px dashed ${p => p.isDragging ? p.theme.colors.border.focus : p.theme.colors.border.main};
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
  transition: border-color 0.15s, background-color 0.15s;
  background-color: ${p => p.isDragging ? p.theme.colors.severity.lowBg : 'transparent'};

  &:hover {
    border-color: ${p => p.theme.colors.text.muted};
  }
`

const UploadIcon = styled.svg`
  margin: 0 auto 1rem;
  height: 3rem;
  width: 3rem;
  color: ${p => p.theme.colors.text.muted};
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

const SuccessIcon = styled.svg`
  margin: 1rem auto 1rem;
  height: 3rem;
  width: 3rem;
  color: ${p => p.theme.colors.accent.green};
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
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.secondary};

  & > p + p {
    margin-top: 0.25rem;
  }
`

const LinkButton = styled.button`
  margin-top: 1rem;
  font-size: 0.875rem;
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
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        uiStore.setZoom(0, 100)
        logStore.uploadFile(files[0])
      }
    },
    [logStore, uiStore]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        uiStore.setZoom(0, 100)
        logStore.uploadFile(files[0])
      }
    },
    [logStore, uiStore]
  )

  return (
    <UploadWrapper>
      <Dropzone
        data-testid="file-dropzone"
        isDragging={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {logStore.parseStatus === 'idle' && (
          <>
            <div className="mb-4">
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
            </div>
            <UploadTitle>Drop blackbox log here</UploadTitle>
            <UploadSubtext>or click to browse</UploadSubtext>
            <input
              type="file"
              accept=".bbl,.bfl,.txt,.csv"
              onChange={handleFileInput}
              className="hidden"
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
            <div className="mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            </div>
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
          <>
            <div className="mb-4">
              <SuccessIcon
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </SuccessIcon>
            </div>
            <StatusText data-testid="parse-success-text">
              Log loaded successfully!
            </StatusText>
            <MetadataBlock data-testid="parse-metadata">
              <p>
                <span className="font-medium">Duration:</span>{' '}
                {logStore.metadata.duration.toFixed(1)}s
              </p>
              <p>
                <span className="font-medium">Loop Rate:</span>{' '}
                {(logStore.metadata.looptime / 1000).toFixed(1)}kHz
              </p>
              {logStore.metadata.craftName && (
                <p>
                  <span className="font-medium">Craft:</span>{' '}
                  {logStore.metadata.craftName}
                </p>
              )}
            </MetadataBlock>
            <LinkButton
              data-testid="upload-different-file"
              onClick={() => { logStore.reset(); analysisStore.reset(); uiStore.reset() }}
            >
              Upload different file
            </LinkButton>
          </>
        )}

        {logStore.parseStatus === 'error' && (
          <>
            <div className="mb-4">
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
            </div>
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
