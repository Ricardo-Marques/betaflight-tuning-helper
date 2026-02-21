import React from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { observer } from 'mobx-react-lite'
import { useAnalysisStore, useLogStore } from '../stores/RootStore'
import type { DetectedIssue, Recommendation } from '@bf-tuner/domain/types/Analysis'

const SEVERITY_COLOR = {
  low: '#FF9800',
  medium: '#FF5722',
  high: '#f44336',
} as const

export const AnalysisScreen = observer(function AnalysisScreen() {
  const logStore = useLogStore()
  const analysisStore = useAnalysisStore()

  if (!logStore.isLoaded) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No log loaded</Text>
        <Text style={styles.emptyHint}>Open a log from the Logs tab</Text>
      </View>
    )
  }

  if (analysisStore.analysisStatus === 'analyzing') {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.analyzingText}>{analysisStore.analysisMessage}</Text>
      </View>
    )
  }

  const { issues, recommendations } = analysisStore

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>
        Issues ({issues.length})
      </Text>

      {issues.length === 0 && (
        <Text style={styles.noneText}>No issues detected for this log.</Text>
      )}

      {issues.map(issue => (
        <IssueCard
          key={issue.id}
          issue={issue}
          selected={analysisStore.selectedIssueId === issue.id}
          onPress={() => analysisStore.selectIssue(
            analysisStore.selectedIssueId === issue.id ? null : issue.id
          )}
        />
      ))}

      {recommendations.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
            Recommendations ({recommendations.length})
          </Text>

          {recommendations.map(rec => (
            <RecommendationCard key={rec.id} recommendation={rec} />
          ))}
        </>
      )}
    </ScrollView>
  )
})

function IssueCard({
  issue,
  selected,
  onPress,
}: {
  issue: DetectedIssue
  selected: boolean
  onPress: () => void
}) {
  const color = SEVERITY_COLOR[issue.severity]
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected, { borderLeftColor: color }]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.severityBadge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.severityText, { color }]}>{issue.severity.toUpperCase()}</Text>
        </View>
        <Text style={styles.axisTag}>{issue.axis.toUpperCase()}</Text>
        {issue.totalOccurrences && issue.totalOccurrences > 1 && (
          <Text style={styles.occurrences}>×{issue.totalOccurrences}</Text>
        )}
      </View>
      <Text style={styles.cardTitle}>{issue.type.replace(/_/g, ' ')}</Text>
      <Text style={styles.cardDesc}>{issue.description}</Text>
    </TouchableOpacity>
  )
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  return (
    <View style={styles.recCard}>
      <View style={styles.recHeader}>
        <Text style={styles.recPriority}>P{recommendation.priority}</Text>
        <Text style={styles.recTitle}>{recommendation.title}</Text>
      </View>
      <Text style={styles.recDesc}>{recommendation.description}</Text>
      {recommendation.changes.map((change, i) => (
        <View key={i} style={styles.changeRow}>
          <Text style={styles.changeParam}>{change.parameter}</Text>
          {change.axis && <Text style={styles.changeAxis}>[{change.axis}]</Text>}
          <Text style={styles.changeValue}>{change.recommendedChange}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  content: {
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: 12,
  },
  empty: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyHint: {
    color: '#555',
    fontSize: 14,
  },
  analyzingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionTitleSpaced: {
    marginTop: 24,
  },
  noneText: {
    color: '#4CAF50',
    fontSize: 14,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#555',
  },
  cardSelected: {
    backgroundColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  axisTag: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
  },
  occurrences: {
    color: '#555',
    fontSize: 11,
    marginLeft: 'auto',
  },
  cardTitle: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  cardDesc: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  recCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  recPriority: {
    backgroundColor: '#4CAF5022',
    color: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  recTitle: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  recDesc: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#1e2e1e',
  },
  changeParam: {
    color: '#4CAF50',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  changeAxis: {
    color: '#666',
    fontSize: 12,
  },
  changeValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
  },
})
