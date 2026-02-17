import { observer } from 'mobx-react-lite'
import { useLogStore, useUIStore, useAnalysisStore } from '../stores/RootStore'
import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

export const LogChart = observer(() => {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()

  // Calculate visible frame range based on zoom
  const visibleFrames = useMemo(() => {
    if (logStore.frames.length === 0) return []

    const totalFrames = logStore.frames.length
    const startIdx = Math.floor((uiStore.zoomStart / 100) * totalFrames)
    const endIdx = Math.ceil((uiStore.zoomEnd / 100) * totalFrames)

    // Downsample for performance (max 2000 points)
    const visibleRange = logStore.frames.slice(startIdx, endIdx)
    const step = Math.max(1, Math.floor(visibleRange.length / 2000))

    return visibleRange.filter((_, i) => i % step === 0)
  }, [logStore.frames, uiStore.zoomStart, uiStore.zoomEnd])

  // Transform frames to chart data
  const chartData = useMemo(() => {
    return visibleFrames.map(frame => ({
      time: frame.time / 1000000, // Convert to seconds
      gyro: frame.gyroADC[uiStore.selectedAxis],
      setpoint: frame.setpoint[uiStore.selectedAxis],
      pidSum: frame.pidSum[uiStore.selectedAxis],
      pidP: frame.pidP[uiStore.selectedAxis],
      pidI: frame.pidI[uiStore.selectedAxis],
      pidD: frame.pidD[uiStore.selectedAxis],
      motor1: frame.motor[0],
      motor2: frame.motor[1],
      motor3: frame.motor[2],
      motor4: frame.motor[3],
      throttle: frame.throttle,
    }))
  }, [visibleFrames, uiStore.selectedAxis])

  // Get issues in visible range
  const visibleIssues = useMemo(() => {
    if (!analysisStore.isComplete || visibleFrames.length === 0) return []

    const startTime = visibleFrames[0].time
    const endTime = visibleFrames[visibleFrames.length - 1].time

    return analysisStore.getIssuesInTimeRange(startTime, endTime)
  }, [analysisStore.isComplete, visibleFrames, analysisStore.issues])

  if (!logStore.isLoaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Upload a log file to view data</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Axis selector */}
      <div className="flex items-center gap-4 p-4 border-b">
        <span className="text-sm font-medium text-gray-700">Axis:</span>
        {(['roll', 'pitch', 'yaw'] as const).map(axis => (
          <button
            key={axis}
            onClick={() => uiStore.setAxis(axis)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              uiStore.selectedAxis === axis
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {axis.charAt(0).toUpperCase() + axis.slice(1)}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uiStore.showGyro}
              onChange={uiStore.toggleGyro}
              className="rounded"
            />
            Gyro
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uiStore.showSetpoint}
              onChange={uiStore.toggleSetpoint}
              className="rounded"
            />
            Setpoint
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uiStore.showPidD}
              onChange={uiStore.togglePidD}
              className="rounded"
            />
            D-term
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uiStore.showMotors}
              onChange={uiStore.toggleMotors}
              className="rounded"
            />
            Motors
          </label>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="time"
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
              stroke="#6b7280"
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <YAxis
              label={{ value: 'deg/s', angle: -90, position: 'insideLeft' }}
              stroke="#6b7280"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
              }}
            />
            <Legend />

            {/* Issue markers */}
            {visibleIssues.map(issue => {
              const issueTime = issue.timeRange[0] / 1000000
              return (
                <ReferenceLine
                  key={issue.id}
                  x={issueTime}
                  stroke={
                    issue.severity === 'critical'
                      ? '#dc2626'
                      : issue.severity === 'high'
                      ? '#f59e0b'
                      : '#3b82f6'
                  }
                  strokeDasharray="3 3"
                  label={{
                    value: issue.type,
                    position: 'top',
                    fontSize: 10,
                  }}
                />
              )
            })}

            {uiStore.showGyro && (
              <Line
                type="monotone"
                dataKey="gyro"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Gyro"
                isAnimationActive={false}
              />
            )}

            {uiStore.showSetpoint && (
              <Line
                type="monotone"
                dataKey="setpoint"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="Setpoint"
                isAnimationActive={false}
                strokeDasharray="5 5"
              />
            )}

            {uiStore.showPidD && (
              <Line
                type="monotone"
                dataKey="pidD"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                dot={false}
                name="D-term"
                isAnimationActive={false}
              />
            )}

            {uiStore.showMotors && (
              <>
                <Line
                  type="monotone"
                  dataKey="motor1"
                  stroke="#ef4444"
                  strokeWidth={1}
                  dot={false}
                  name="M1"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor2"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  dot={false}
                  name="M2"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor3"
                  stroke="#10b981"
                  strokeWidth={1}
                  dot={false}
                  name="M3"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor4"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dot={false}
                  name="M4"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Zoom slider */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Zoom:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={uiStore.zoomStart}
            onChange={e =>
              uiStore.setZoom(parseFloat(e.target.value), uiStore.zoomEnd)
            }
            className="flex-1"
          />
          <input
            type="range"
            min="0"
            max="100"
            value={uiStore.zoomEnd}
            onChange={e =>
              uiStore.setZoom(uiStore.zoomStart, parseFloat(e.target.value))
            }
            className="flex-1"
          />
          <button
            onClick={() => uiStore.setZoom(0, 100)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
})
