import { observer } from 'mobx-react-lite'
import { useLogStore } from '../stores/RootStore'
import { useState, useCallback } from 'react'

export const FileUpload = observer(() => {
  const logStore = useLogStore()
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
        logStore.uploadFile(files[0])
      }
    },
    [logStore]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        logStore.uploadFile(files[0])
      }
    },
    [logStore]
  )

  return (
    <div className="p-4">
      <div
        data-testid="file-dropzone"
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {logStore.parseStatus === 'idle' && (
          <>
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
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
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drop blackbox log here
            </p>
            <p className="text-sm text-gray-500 mb-4">or click to browse</p>
            <input
              type="file"
              accept=".bbl,.bfl,.txt,.csv"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
            >
              Select File
            </label>
            <p className="text-xs text-gray-400 mt-4">
              Supports .bbl, .bfl, .txt, .csv (Betaflight Blackbox)
            </p>
          </>
        )}

        {logStore.parseStatus === 'parsing' && (
          <>
            <div className="mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            </div>
            <p data-testid="parse-status-text" className="text-lg font-medium text-gray-700 mb-2">
              Parsing log...
            </p>
            <div data-testid="parse-progress-bar" className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${logStore.parseProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500">{logStore.parseMessage}</p>
          </>
        )}

        {logStore.parseStatus === 'success' && logStore.metadata && (
          <>
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-green-500"
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
              </svg>
            </div>
            <p data-testid="parse-success-text" className="text-lg font-medium text-gray-700 mb-2">
              Log loaded successfully!
            </p>
            <div data-testid="parse-metadata" className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium">Frames:</span>{' '}
                {logStore.metadata.frameCount.toLocaleString()}
              </p>
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
            </div>
            <button
              data-testid="upload-different-file"
              onClick={() => logStore.reset()}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Upload different file
            </button>
          </>
        )}

        {logStore.parseStatus === 'error' && (
          <>
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-red-500"
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
              </svg>
            </div>
            <p data-testid="parse-error-text" className="text-lg font-medium text-red-700 mb-2">Parse failed</p>
            <p className="text-sm text-red-600">{logStore.parseError}</p>
            <button
              onClick={() => logStore.reset()}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
})
