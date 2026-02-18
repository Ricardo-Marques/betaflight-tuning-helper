import { Theme } from './types'

export const darkTheme: Theme = {
  colors: {
    background: {
      app: '#111827',       // gray-900
      panel: '#1f2937',     // gray-800
      section: '#1a2332',
      header: '#0f172a',    // slate-900 (matches footer)
      footer: '#0f172a',    // slate-900
      input: '#374151',     // gray-700
      hover: '#374151',     // gray-700
      selected: '#1e3a5f',
      cliPreview: '#0f172a',
    },
    text: {
      primary: '#e5e7eb',   // gray-200
      secondary: '#d1d5db', // gray-300
      muted: '#6b7280',     // gray-500
      inverse: '#ffffff',
      link: '#60a5fa',      // blue-400
      linkHover: '#93bbfd',
      heading: '#f3f4f6',   // gray-100
      headerSubtle: '#6b7280', // gray-500
    },
    border: {
      main: '#374151',      // gray-700
      subtle: '#374151',    // gray-700 (slightly brighter for visibility)
      focus: '#60a5fa',     // blue-400
    },
    severity: {
      high: '#f87171',      // red-400
      highBg: '#5c2020',    // brighter red bg for better card contrast
      highText: '#fca5a5',  // red-300
      medium: '#fbbf24',    // amber-400
      mediumBg: '#5c3a0e',  // brighter amber bg for better card contrast
      mediumText: '#fde68a', // amber-200
      low: '#60a5fa',       // blue-400
      lowBg: '#1e3a5f',     // brighter blue bg for better card contrast
      lowText: '#93c5fd',   // blue-300
    },
    chart: {
      gyro: '#60a5fa',      // blue-400
      setpoint: '#34d399',  // emerald-400
      pidD: '#a78bfa',      // violet-400
      motor1: '#f87171',    // red-400
      motor2: '#fbbf24',    // amber-400
      motor3: '#34d399',    // emerald-400
      motor4: '#60a5fa',    // blue-400
      throttle: '#c084fc',  // purple-400
      grid: '#374151',      // gray-700
      axis: '#9ca3af',      // gray-400
      tooltipBg: 'rgba(31, 41, 55, 0.95)',
      tooltipBorder: '#374151',
    },
    button: {
      primary: '#3b82f6',   // blue-500
      primaryHover: '#2563eb', // blue-600
      primaryText: '#ffffff',
      secondary: '#374151', // gray-700
      secondaryHover: '#4b5563', // gray-600
      secondaryText: '#e5e7eb', // gray-200
    },
    health: {
      excellentBg: '#052e16', // green-950
      excellentText: '#86efac', // green-300
      goodBg: '#172554',    // blue-950
      goodText: '#93c5fd',  // blue-300
      needsWorkBg: '#422006', // amber-950
      needsWorkText: '#fde68a', // amber-200
      criticalBg: '#450a0a', // red-950
      criticalText: '#fca5a5', // red-300
    },
    accent: {
      indigo: '#818cf8',    // indigo-400
      indigoBg: '#1e1b4b',  // indigo-950
      indigoText: '#c7d2fe', // indigo-200
      green: '#4ade80',     // green-400
      greenBg: '#052e16',   // green-950
      greenText: '#86efac',  // green-300
      orange: '#fb923c',    // orange-400
      orangeText: '#fed7aa', // orange-200
    },
    scrollbar: {
      track: '#1f2937',
      thumb: '#4b5563',
      thumbHover: '#6b7280',
    },
    change: {
      increase: '#4ade80',  // green-400
      decrease: '#fbbf24',  // amber-400
      neutral: '#d1d5db',   // gray-300
    },
  },
}
