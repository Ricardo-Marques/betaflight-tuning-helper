import { TuningRule } from '../types/TuningRule'
import { DetectedIssue, Recommendation } from '../types/Analysis'
import { generateId } from '../utils/generateId'

/**
 * Generates recommendations for temporal meta-issues
 * (thermalDegradation and mechanicalEvent).
 *
 * Detection is handled by TemporalProgressionAnalyzer, not by window scanning,
 * so condition() always returns false.
 */
export const TemporalPatternRule: TuningRule = {
  id: 'temporal-pattern',
  name: 'Temporal Pattern',
  description: 'Recommendations for issues that worsen or appear suddenly during flight',
  baseConfidence: 0.7,
  issueTypes: ['thermalDegradation', 'mechanicalEvent'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (): boolean => false,

  detect: (): DetectedIssue[] => [],

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type === 'thermalDegradation') {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'hardwareCheck',
          priority: 5,
          confidence: issue.confidence,
          category: 'hardware',
          title: `Issues worsen over flight on ${issue.axis}`,
          description: issue.description,
          rationale:
            'When multiple issues get progressively worse during a flight, it usually indicates thermal degradation — motors or ESCs overheating and losing performance. This is common with aggressive tunes, undersized motors, or hot weather.',
          risks: [
            'May require shorter flights or less aggressive flying',
            'Could indicate motors nearing end of life',
          ],
          changes: [],
          expectedImprovement: 'Identifying the thermal source prevents motor damage and improves late-flight performance',
        })
      }

      if (issue.type === 'mechanicalEvent') {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'hardwareCheck',
          priority: 8,
          confidence: issue.confidence,
          category: 'hardware',
          title: `Sudden mechanical issue on ${issue.axis}`,
          description: issue.description,
          rationale:
            'A mechanical issue appearing suddenly mid-flight — rather than being present from the start — strongly suggests something changed physically: a prop strike, loose screw, or bearing failure.',
          risks: [
            'Continuing to fly may cause further damage',
            'May indicate prop damage not visible to the eye',
          ],
          changes: [],
          expectedImprovement: 'Inspecting and replacing damaged hardware eliminates the vibration source',
        })
      }
    }

    return recommendations
  },
}
