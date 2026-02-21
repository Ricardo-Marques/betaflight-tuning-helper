import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NavigationContainer } from '@react-navigation/native'
import { Text } from 'react-native'
import { HomeScreen } from '../screens/HomeScreen'
import { ChartScreen } from '../screens/ChartScreen'
import { UsbScreen } from '../screens/UsbScreen'
import { AnalysisScreen } from '../screens/AnalysisScreen'
import { useLogStore, useAnalysisStore } from '../stores/RootStore'
import { observer } from 'mobx-react-lite'

const Tab = createBottomTabNavigator()

export const AppNavigator = observer(function AppNavigator() {
  const logStore = useLogStore()
  const analysisStore = useAnalysisStore()

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1a1a1a',
            borderTopColor: '#333',
          },
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#666',
        }}
      >
        <Tab.Screen
          name="Logs"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Logs',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📁</Text>,
          }}
        />
        <Tab.Screen
          name="Chart"
          component={ChartScreen}
          options={{
            tabBarLabel: 'Chart',
            tabBarBadge: logStore.isLoaded ? undefined : undefined,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📈</Text>,
          }}
        />
        <Tab.Screen
          name="Analysis"
          component={AnalysisScreen}
          options={{
            tabBarLabel: 'Analysis',
            tabBarBadge:
              analysisStore.highSeverityIssues.length > 0
                ? analysisStore.highSeverityIssues.length
                : undefined,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔍</Text>,
          }}
        />
        <Tab.Screen
          name="USB"
          component={UsbScreen}
          options={{
            tabBarLabel: 'USB',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔌</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
})
