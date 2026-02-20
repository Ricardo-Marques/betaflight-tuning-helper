import { Theme } from './types'

export const lightTheme: Theme = {
  colors: {
    background: {
      app: '#f3f4f6',       // gray-100
      panel: '#ffffff',
      section: '#f9fafb',   // gray-50
      header: '#1f2937',    // gray-800 (matches footer)
      footer: '#1f2937',    // gray-800
      input: '#ffffff',
      hover: '#f3f4f6',     // gray-100
      selected: '#dbeafe',  // blue-100
      cliPreview: '#111827', // gray-900
      appGradientEnd: '#f6f7f9',
    },
    text: {
      primary: '#374151',   // gray-700
      secondary: '#4b5563', // gray-600
      muted: '#9ca3af',     // gray-400
      inverse: '#ffffff',
      link: '#2563eb',      // blue-600
      linkHover: '#1e40af', // blue-800
      heading: '#374151',   // gray-700
      headerSubtle: '#9ca3af', // gray-400
    },
    border: {
      main: '#e5e7eb',      // gray-200
      subtle: '#f3f4f6',    // gray-100
      focus: '#3b82f6',     // blue-500
    },
    severity: {
      high: '#dc2626',      // red-600
      highBg: '#fef2f2',    // red-50
      highText: '#991b1b',  // red-800
      medium: '#f59e0b',    // amber-500
      mediumBg: '#fffbeb',  // amber-50
      mediumText: '#92400e', // amber-800
      low: '#3b82f6',       // blue-500
      lowBg: '#eff6ff',     // blue-50
      lowText: '#1e40af',   // blue-800
    },
    chart: {
      gyro: '#3b82f6',      // blue-500
      setpoint: '#10b981',  // emerald-500
      pidP: '#f97316',      // orange-500
      pidI: '#06b6d4',      // cyan-500
      pidD: '#8b5cf6',      // violet-500
      pidSum: '#ec4899',    // pink-500
      motor1: '#ef4444',    // red-500
      motor2: '#f59e0b',    // amber-500
      motor3: '#10b981',    // emerald-500
      motor4: '#3b82f6',    // blue-500
      throttle: '#a855f7',  // purple-500
      grid: '#e5e7eb',      // gray-200
      axis: '#6b7280',      // gray-500
      tooltipBg: 'rgba(255, 255, 255, 0.95)',
      tooltipBorder: '#e5e7eb',
    },
    button: {
      primary: '#2563eb',   // blue-600
      primaryHover: '#1d4ed8', // blue-700
      primaryText: '#ffffff',
      secondary: '#e5e7eb', // gray-200
      secondaryHover: '#d1d5db', // gray-300
      secondaryText: '#374151', // gray-700
    },
    health: {
      excellentBg: '#dcfce7', // green-100
      excellentText: '#166534', // green-800
      goodBg: '#dbeafe',    // blue-100
      goodText: '#1e40af',  // blue-800
      needsWorkBg: '#fef9c3', // yellow-100
      needsWorkText: '#854d0e', // yellow-800
      criticalBg: '#fee2e2', // red-100
      criticalText: '#991b1b', // red-800
    },
    accent: {
      indigo: '#4f46e5',    // indigo-600
      indigoBg: '#eef2ff',  // indigo-50
      indigoText: '#312e81', // indigo-900
      green: '#16a34a',     // green-600
      greenBg: '#f0fdf4',   // green-50
      greenText: '#166534',  // green-800
      orange: '#f97316',
      orangeText: '#c2410c', // orange-700
    },
    scrollbar: {
      track: '#f1f1f1',
      thumb: '#888888',
      thumbHover: '#555555',
    },
    change: {
      increase: '#15803d',  // green-700
      decrease: '#b45309',  // amber-700
      neutral: '#374151',   // gray-700
    },
  },
}
