export type QuadSize = 'whoop' | 'toothpick3' | 'five_inch' | 'seven_inch' | 'xclass'

export interface ThresholdScaling {
  gyroNoise: number
  dtermNoise: number
  propwashAmplitude: number
  bouncebackOvershoot: number
  wobbleAmplitude: number
  motorSaturation: number
  trackingError: number
  highThrottleOscillation: number
  filterMismatch: number
}

export interface RecommendationOverrides {
  propwashPreferItermRelax: boolean
  itermRelaxCutoff: number
  warnAggressiveFiltering: boolean
  motorAuthorityLimited: boolean
  expectedDtoPRatio: string
}

export interface QuadProfile {
  id: QuadSize
  label: string
  description: string
  thresholds: ThresholdScaling
  overrides: RecommendationOverrides
}
