import { AnalysisResult, DetectedIssue, FlightPhase, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'

/**
 * Generate analysis summary from detected issues and recommendations
 */
export function generateSummary(
  issues: DetectedIssue[],
  recommendations: Recommendation[]
): AnalysisResult['summary'] {
  const highCount = issues.filter(i => i.severity === 'high').length
  const mediumCount = issues.filter(i => i.severity === 'medium').length
  const lowCount = issues.filter(i => i.severity === 'low').length

  let overallHealth: 'excellent' | 'good' | 'needsWork' | 'poor'
  if (highCount > 3) {
    overallHealth = 'poor'
  } else if (highCount > 0 || mediumCount > 5) {
    overallHealth = 'needsWork'
  } else if (mediumCount > 0 || lowCount > 3) {
    overallHealth = 'good'
  } else {
    overallHealth = 'excellent'
  }

  const topPriorities = recommendations.slice(0, 3).map(r => r.title)

  return {
    overallHealth,
    highIssueCount: highCount,
    mediumIssueCount: mediumCount,
    lowIssueCount: lowCount,
    topPriorities,
  }
}

/**
 * Generate flight segments for UI timeline
 */
export function generateFlightSegments(
  frames: LogFrame[],
  issues: DetectedIssue[]
): AnalysisResult['segments'] {
  const segments: AnalysisResult['segments'] = []
  const segmentSize = 1000 // ~125ms at 8kHz

  for (let i = 0; i < frames.length; i += segmentSize) {
    const segmentFrames = frames.slice(i, Math.min(i + segmentSize, frames.length))
    const startTime = segmentFrames[0].time
    const endTime = segmentFrames[segmentFrames.length - 1].time

    const issueCount = issues.filter(
      issue => issue.timeRange[0] <= endTime && issue.timeRange[1] >= startTime
    ).length

    const avgThrottle =
      segmentFrames.reduce((sum, f) => sum + f.throttle, 0) / segmentFrames.length
    let phase: FlightPhase
    if (avgThrottle < 1050) phase = 'idle'
    else if (avgThrottle > 1700) phase = 'punch'
    else if (avgThrottle < 1300) phase = 'hover'
    else phase = 'cruise'

    segments.push({
      id: `segment-${i}`,
      startTime,
      endTime,
      phase,
      description: formatSegmentDescription(phase, startTime, endTime),
      issueCount,
    })
  }

  const mergedSegments: typeof segments = []
  for (const seg of segments) {
    const last = mergedSegments[mergedSegments.length - 1]
    if (last && last.phase === seg.phase) {
      last.endTime = seg.endTime
      last.description = formatSegmentDescription(last.phase, last.startTime, last.endTime)
    } else {
      mergedSegments.push({ ...seg })
    }
  }

  // Recount issues against merged time ranges, expanding collapsed occurrences
  for (const seg of mergedSegments) {
    seg.issueCount = issues.reduce((count, issue) => {
      const occ = issue.occurrences ?? [issue.timeRange]
      return count + occ.filter(tr => tr[0] <= seg.endTime && tr[1] >= seg.startTime).length
    }, 0)
  }

  return mergedSegments
}

function formatSegmentDescription(phase: FlightPhase, startTime: number, endTime: number): string {
  const dur = (endTime - startTime) / 1_000_000
  const formatted = dur >= 60
    ? `${Math.floor(dur / 60)}m:${String(Math.floor(dur % 60)).padStart(2, '0')}s`
    : `${dur.toFixed(1)}s`
  return `${phase.charAt(0).toUpperCase() + phase.slice(1)} (${formatted})`
}
