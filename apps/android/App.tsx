/**
 * Root component for the Betaflight Tuning Helper Android app.
 *
 * Sets up:
 * - MobX RootStore via React context
 * - React Navigation
 * - GestureHandlerRootView (required by react-native-gesture-handler)
 */
import 'react-native-gesture-handler'
import React, { useRef } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet } from 'react-native'
import { RootStore, StoreProvider } from './src/stores/RootStore'
import { AppNavigator } from './src/navigation/AppNavigator'

export default function App() {
  const storeRef = useRef<RootStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = new RootStore()
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StoreProvider value={storeRef.current}>
        <StatusBar style="light" backgroundColor="#111" />
        <AppNavigator />
      </StoreProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111',
  },
})
