/**
 * UsbScreen — USB OTG connection hub.
 *
 * Three modes:
 * 1. Flash download — connect FC via USB OTG, download dataflash via MSP protocol
 * 2. Read settings — connect FC via USB CLI, read current PID/filter settings
 * 3. Write tune — send recommended CLI commands back to FC
 *
 * All serial communication is handled by the MobX stores:
 * - FlashDownloadStore for MSP flash protocol
 * - SerialStore for CLI settings read/write
 */
import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { observer } from 'mobx-react-lite'
import { useSerialStore, useFlashDownloadStore } from '../stores/RootStore'
import type { UsbDeviceInfo } from '../serial/AndroidUsbSerial'

type Mode = 'menu' | 'flash' | 'cli'

export const UsbScreen = observer(function UsbScreen() {
  const serialStore = useSerialStore()
  const flashStore = useFlashDownloadStore()
  const [mode, setMode] = useState<Mode>('menu')

  const goToMenu = () => {
    setMode('menu')
    serialStore.disconnect().catch(() => {})
    flashStore.disconnect().catch(() => {})
  }

  if (mode === 'flash') return <FlashMode onBack={goToMenu} />
  if (mode === 'cli') return <CliMode onBack={goToMenu} />

  return (
    <View style={styles.container}>
      <Text style={styles.header}>USB Connection</Text>
      <Text style={styles.subheader}>
        Connect your flight controller via USB OTG cable
      </Text>

      <TouchableOpacity style={styles.modeCard} onPress={() => setMode('flash')}>
        <Text style={styles.modeIcon}>💾</Text>
        <View style={styles.modeText}>
          <Text style={styles.modeTitle}>Download Flash Log</Text>
          <Text style={styles.modeDesc}>
            Download blackbox data from the FC's onboard flash memory via MSP protocol
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.modeCard} onPress={() => setMode('cli')}>
        <Text style={styles.modeIcon}>⚙️</Text>
        <View style={styles.modeText}>
          <Text style={styles.modeTitle}>Read / Write Settings</Text>
          <Text style={styles.modeDesc}>
            Read current PID and filter settings, or apply tuning recommendations via CLI
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  )
})

// ─── Flash Download Mode ──────────────────────────────────────────────────────

const FlashMode = observer(function FlashMode({ onBack }: { onBack: () => void }) {
  const flashStore = useFlashDownloadStore()

  const connect = () => flashStore.connect()
  const cancel = () => flashStore.cancelDownload()
  const erase = () => {
    Alert.alert(
      'Erase Flash',
      'This will permanently delete all blackbox logs on the FC. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: () => flashStore.eraseFlash() },
      ]
    )
  }

  const formatBytes = (b: number) => {
    if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${b} B`
  }

  const formatSpeed = (bps: number) => {
    if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
    return `${bps} B/s`
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.subHeader}>Flash Download</Text>
      </View>

      {flashStore.status === 'idle' && (
        <View style={styles.center}>
          <Text style={styles.prompt}>Connect your FC via OTG cable, then tap Connect</Text>
          <TouchableOpacity style={styles.button} onPress={connect}>
            <Text style={styles.buttonText}>Connect & Download</Text>
          </TouchableOpacity>
        </View>
      )}

      {(flashStore.status === 'connecting' || flashStore.status === 'reading_summary') && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.statusText}>
            {flashStore.status === 'connecting' ? 'Connecting...' : 'Reading flash info...'}
          </Text>
        </View>
      )}

      {flashStore.status === 'downloading' && (
        <View style={styles.center}>
          <Text style={styles.statusText}>
            {formatBytes(flashStore.bytesDownloaded)} / {formatBytes(flashStore.flashUsedSize)}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${flashStore.downloadPercent}%` }]} />
          </View>
          <Text style={styles.statusSubText}>
            {formatSpeed(flashStore.speedBytesPerSec)} · ~{flashStore.estimatedSecondsRemaining.toFixed(0)}s remaining
          </Text>
          {flashStore.logs.length > 0 && (
            <Text style={styles.statusSubText}>
              {flashStore.logs.length} log{flashStore.logs.length > 1 ? 's' : ''} found
            </Text>
          )}
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={cancel}>
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {(flashStore.status === 'pick_log' || flashStore.status === 'complete') && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>Select a log to analyze:</Text>
          {flashStore.logs.map((log, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.logCard,
                !flashStore.canSelectLog(i) && styles.logCardDisabled,
              ]}
              disabled={!flashStore.canSelectLog(i)}
              onPress={() => flashStore.selectAndParse(i)}
            >
              <Text style={styles.logIndex}>Log {i + 1}</Text>
              <Text style={styles.logSize}>
                {log.size > 0 ? formatBytes(log.size) : 'Unknown size'}
              </Text>
              {!flashStore.canSelectLog(i) && (
                <Text style={styles.logNotReady}>Not fully downloaded</Text>
              )}
            </TouchableOpacity>
          ))}

          {flashStore.status === 'complete' && (
            <Text style={styles.successText}>
              Log loaded! Switch to Chart or Analysis tabs.
            </Text>
          )}

          <TouchableOpacity style={[styles.button, styles.dangerButton, { marginTop: 24 }]} onPress={erase}>
            <Text style={styles.buttonText}>Erase Flash</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {flashStore.status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{flashStore.errorMessage}</Text>
          <TouchableOpacity style={styles.button} onPress={connect}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {(flashStore.status === 'erasing') && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f44336" />
          <Text style={styles.statusText}>{flashStore.eraseMessage || 'Erasing...'}</Text>
        </View>
      )}

      {flashStore.status === 'erase_complete' && (
        <View style={styles.center}>
          <Text style={styles.successText}>Flash erased successfully.</Text>
          <TouchableOpacity style={styles.button} onPress={connect}>
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
})

// ─── CLI Settings Mode ────────────────────────────────────────────────────────

const CliMode = observer(function CliMode({ onBack }: { onBack: () => void }) {
  const serialStore = useSerialStore()
  const [devices, setDevices] = useState<UsbDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<number | undefined>()

  const listDevices = async () => {
    await serialStore.listDevices()
    setDevices(serialStore.availableDevices)
  }

  const connect = () => serialStore.connect(selectedDevice)
  const disconnect = () => serialStore.disconnect()

  useEffect(() => {
    listDevices()
  }, [])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.subHeader}>CLI Settings</Text>
      </View>

      {/* Device list */}
      {devices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>USB Devices</Text>
          {devices.map(d => (
            <TouchableOpacity
              key={d.deviceId}
              style={[styles.deviceCard, selectedDevice === d.deviceId && styles.deviceCardSelected]}
              onPress={() => setSelectedDevice(d.deviceId)}
            >
              <Text style={styles.deviceName}>{d.productName}</Text>
              <Text style={styles.deviceId}>VID:{d.vendorId.toString(16).padStart(4, '0')} PID:{d.productId.toString(16).padStart(4, '0')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Connection status */}
      <View style={styles.section}>
        {!serialStore.isConnected && !serialStore.isBusy && (
          <>
            <TouchableOpacity style={styles.button} onPress={connect}>
              <Text style={styles.buttonText}>Connect via USB OTG</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={listDevices}>
              <Text style={[styles.buttonText, { color: '#aaa' }]}>Refresh Device List</Text>
            </TouchableOpacity>
          </>
        )}

        {serialStore.isBusy && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.statusText}>{serialStore.currentCommand || 'Working...'}</Text>
            {serialStore.progress > 0 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${serialStore.progress}%` }]} />
              </View>
            )}
          </View>
        )}

        {serialStore.isConnected && (
          <View style={styles.connectedInfo}>
            <Text style={styles.connectedText}>● Connected to FC</Text>
            <Text style={styles.connectedHint}>
              Use the Logs tab to open a log file for analysis. After analysis, recommended settings will appear here.
            </Text>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={disconnect}>
              <Text style={[styles.buttonText, { color: '#aaa' }]}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        )}

        {serialStore.status === 'error' && (
          <Text style={styles.errorText}>{serialStore.errorMessage}</Text>
        )}
      </View>
    </ScrollView>
  )
})

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  scroll: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  header: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
  },
  subheader: {
    color: '#666',
    fontSize: 14,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    marginBottom: 16,
  },
  back: {
    color: '#4CAF50',
    fontSize: 16,
  },
  subHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modeCard: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 16,
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modeIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  modeText: {
    flex: 1,
  },
  modeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modeDesc: {
    color: '#777',
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginBottom: 20,
    gap: 10,
  },
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  prompt: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
  statusSubText: {
    color: '#666',
    fontSize: 12,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#222',
  },
  cancelButton: {
    backgroundColor: '#555',
  },
  dangerButton: {
    backgroundColor: '#8B0000',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
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
  logCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logCardDisabled: {
    opacity: 0.4,
  },
  logIndex: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
  },
  logSize: {
    color: '#888',
    fontSize: 13,
  },
  logNotReady: {
    color: '#555',
    fontSize: 11,
  },
  deviceCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  deviceCardSelected: {
    borderColor: '#4CAF50',
  },
  deviceName: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '500',
  },
  deviceId: {
    color: '#555',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  connectedInfo: {
    gap: 12,
  },
  connectedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  connectedHint: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
})
