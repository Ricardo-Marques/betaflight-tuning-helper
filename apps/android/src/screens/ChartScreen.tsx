import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { observer } from 'mobx-react-lite'
import { LogChart } from '../components/LogChart'
import { useLogStore } from '../stores/RootStore'

type ChartAxis = 'roll' | 'pitch' | 'yaw'

export const ChartScreen = observer(function ChartScreen() {
  const logStore = useLogStore()
  const [axis, setAxis] = useState<ChartAxis>('roll')
  const [showSetpoint, setShowSetpoint] = useState(true)
  const [showPidSum, setShowPidSum] = useState(false)

  if (!logStore.isLoaded) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No log loaded</Text>
        <Text style={styles.emptyHint}>Open a log from the Logs tab</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Axis selector */}
      <View style={styles.axisBar}>
        {(['roll', 'pitch', 'yaw'] as ChartAxis[]).map(a => (
          <TouchableOpacity
            key={a}
            style={[styles.axisTab, axis === a && styles.axisTabActive]}
            onPress={() => setAxis(a)}
          >
            <Text style={[styles.axisTabText, axis === a && styles.axisTabTextActive]}>
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LogChart
          axis={axis}
          showSetpoint={showSetpoint}
          showPidSum={showPidSum}
          zoomStart={0}
          zoomEnd={100}
        />
      </View>

      {/* Toggle overlays */}
      <View style={styles.toggleBar}>
        <ToggleButton
          label="Setpoint"
          active={showSetpoint}
          color="#FF9800"
          onPress={() => setShowSetpoint(v => !v)}
        />
        <ToggleButton
          label="PID Sum"
          active={showPidSum}
          color="#2196F3"
          onPress={() => setShowPidSum(v => !v)}
        />
      </View>
    </View>
  )
})

function ToggleButton({
  label,
  active,
  color,
  onPress,
}: {
  label: string
  active: boolean
  color: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.toggle, active && { borderColor: color }]}
      onPress={onPress}
    >
      <View style={[styles.toggleDot, { backgroundColor: active ? color : '#444' }]} />
      <Text style={styles.toggleText}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 48,
  },
  empty: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyHint: {
    color: '#555',
    fontSize: 14,
    marginTop: 8,
  },
  axisBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingHorizontal: 16,
  },
  axisTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 4,
  },
  axisTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
  },
  axisTabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  axisTabTextActive: {
    color: '#4CAF50',
  },
  chartContainer: {
    flex: 1,
  },
  toggleBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggleText: {
    color: '#aaa',
    fontSize: 13,
  },
})
