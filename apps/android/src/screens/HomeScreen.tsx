/**
 * HomeScreen — log file picker and parse status.
 *
 * Uses expo-document-picker (SAF-based) to let users pick .bbl/.bfl/.txt/.csv
 * files from their device storage, Downloads folder, or SD card.
 */
import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { observer } from 'mobx-react-lite'
import * as DocumentPicker from 'expo-document-picker'
import { Asset } from 'expo-asset'
import { useLogStore } from '../stores/RootStore'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SAMPLE_SHORT = require('../../assets/sample-short.bfl')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SAMPLE_LONG = require('../../assets/sample-long.bfl')

export const HomeScreen = observer(function HomeScreen() {
  const logStore = useLogStore()

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // SAF doesn't filter by extension reliably on all Android versions.
        // We accept all files and validate via extension in parseLogFile.
        type: '*/*',
        copyToCacheDirectory: true,
      })

      if (result.canceled) return

      const asset = result.assets[0]
      if (!asset?.uri) return

      const uri = asset.uri
      const lower = uri.toLowerCase()
      if (!lower.endsWith('.bbl') && !lower.endsWith('.bfl') && !lower.endsWith('.txt') && !lower.endsWith('.csv')) {
        // Simple rejection — parseLogFile will also throw, but this gives a cleaner message
        logStore['parseError'] = 'Unsupported file type. Please pick a .bbl, .bfl, .txt, or .csv file.'
        return
      }

      await logStore.uploadFromUri(uri)
    } catch (err) {
      console.error('File picker error:', err)
    }
  }

  const reset = () => logStore.reset()

  const loadSample = async (module: number) => {
    try {
      const [asset] = await Asset.loadAsync(module)
      if (asset.localUri) {
        await logStore.uploadFromUri(asset.localUri)
      }
    } catch (err) {
      console.error('Sample load error:', err)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Betaflight Tuning Helper</Text>
        <Text style={styles.subtitle}>Blackbox log analyzer for Android</Text>
      </View>

      {logStore.parseStatus === 'idle' && (
        <View style={styles.center}>
          <Text style={styles.prompt}>Select a blackbox log to analyze</Text>
          <TouchableOpacity style={styles.button} onPress={pickFile}>
            <Text style={styles.buttonText}>Open Log File</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Supports .bbl, .bfl, .txt, .csv</Text>
          <Text style={styles.hint}>For dataflash logs: use the USB tab</Text>

          <Text style={styles.sampleLabel}>Or try a sample log:</Text>
          <View style={styles.sampleRow}>
            <TouchableOpacity style={styles.sampleButton} onPress={() => loadSample(SAMPLE_SHORT)}>
              <Text style={styles.sampleButtonText}>Short</Text>
              <Text style={styles.sampleButtonHint}>~1.4 MB</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sampleButton} onPress={() => loadSample(SAMPLE_LONG)}>
              <Text style={styles.sampleButtonText}>Long</Text>
              <Text style={styles.sampleButtonHint}>~9 MB</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {logStore.parseStatus === 'parsing' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4CAF50" style={styles.spinner} />
          <Text style={styles.progressText}>{logStore.parseMessage}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${logStore.parseProgress}%` }]} />
          </View>
          <Text style={styles.progressPct}>{logStore.parseProgress}%</Text>
        </View>
      )}

      {logStore.parseStatus === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Parse failed</Text>
          <Text style={styles.errorText}>{logStore.parseError}</Text>
          <TouchableOpacity style={styles.button} onPress={pickFile}>
            <Text style={styles.buttonText}>Try Another File</Text>
          </TouchableOpacity>
        </View>
      )}

      {logStore.parseStatus === 'success' && logStore.metadata && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.successCard}>
            <Text style={styles.cardTitle}>Log loaded</Text>

            <Row label="Craft" value={logStore.metadata.craftName ?? '—'} />
            <Row label="Duration" value={`${logStore.metadata.duration.toFixed(1)} s`} />
            <Row label="Sample rate" value={`${(logStore.metadata.looptime / 1000).toFixed(1)} kHz`} />
            <Row label="Frames" value={logStore.frameCount.toLocaleString()} />
            <Row label="Firmware" value={logStore.metadata.firmwareVersion} />
            {logStore.trimInfo && (
              <Row
                label="Trimmed"
                value={`${logStore.trimInfo.startSeconds.toFixed(1)} s start / ${logStore.trimInfo.endSeconds.toFixed(1)} s end`}
              />
            )}
          </View>

          <Text style={styles.navHint}>
            Use the Chart tab to view signal data, Analysis tab to see detected issues.
          </Text>

          <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={reset}>
            <Text style={styles.buttonText}>Open Different File</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  )
})

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 48,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  prompt: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 12,
  },
  resetButton: {
    backgroundColor: '#555',
    marginHorizontal: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  hint: {
    color: '#555',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  spinner: {
    marginBottom: 24,
  },
  progressText: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressPct: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  errorTitle: {
    color: '#f44336',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  errorText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  scroll: {
    paddingBottom: 32,
  },
  successCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  rowLabel: {
    color: '#888',
    fontSize: 14,
  },
  rowValue: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '500',
  },
  navHint: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 18,
  },
  sampleLabel: {
    color: '#555',
    fontSize: 13,
    marginTop: 28,
    marginBottom: 10,
  },
  sampleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sampleButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sampleButtonText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  sampleButtonHint: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
})
