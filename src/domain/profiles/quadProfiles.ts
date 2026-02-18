import { QuadProfile, QuadSize } from '../types/QuadProfile'

const whoopProfile: QuadProfile = {
  id: 'whoop',
  label: 'Whoop',
  description: '65-85mm brushless whoops (1S-2S)',
  thresholds: {
    gyroNoise: 2.5,
    dtermNoise: 2.0,
    propwashAmplitude: 1.5,
    bouncebackOvershoot: 1.3,
    wobbleAmplitude: 1.3,
    motorSaturation: 1.8,
    trackingError: 1.3,
    highThrottleOscillation: 1.5,
  },
  overrides: {
    propwashPreferItermRelax: true,
    itermRelaxCutoff: 10,
    warnAggressiveFiltering: true,
    motorAuthorityLimited: true,
    expectedDtoPRatio: '~1:1',
  },
}

const toothpick3Profile: QuadProfile = {
  id: 'toothpick3',
  label: '3"',
  description: '3" toothpicks and micros (1S-4S)',
  thresholds: {
    gyroNoise: 1.5,
    dtermNoise: 1.3,
    propwashAmplitude: 1.2,
    bouncebackOvershoot: 1.1,
    wobbleAmplitude: 1.1,
    motorSaturation: 1.3,
    trackingError: 1.1,
    highThrottleOscillation: 1.2,
  },
  overrides: {
    propwashPreferItermRelax: false,
    itermRelaxCutoff: 0,
    warnAggressiveFiltering: false,
    motorAuthorityLimited: false,
    expectedDtoPRatio: '~0.7:1',
  },
}

const fiveInchProfile: QuadProfile = {
  id: 'five_inch',
  label: '5"',
  description: '5" freestyle/racing quads (4S-6S)',
  thresholds: {
    gyroNoise: 1.0,
    dtermNoise: 1.0,
    propwashAmplitude: 1.0,
    bouncebackOvershoot: 1.0,
    wobbleAmplitude: 1.0,
    motorSaturation: 1.0,
    trackingError: 1.0,
    highThrottleOscillation: 1.0,
  },
  overrides: {
    propwashPreferItermRelax: false,
    itermRelaxCutoff: 0,
    warnAggressiveFiltering: false,
    motorAuthorityLimited: false,
    expectedDtoPRatio: '~0.65:1',
  },
}

const sevenInchProfile: QuadProfile = {
  id: 'seven_inch',
  label: '7"',
  description: '7" long-range and cinematic quads (6S)',
  thresholds: {
    gyroNoise: 0.8,
    dtermNoise: 0.9,
    propwashAmplitude: 1.3,
    bouncebackOvershoot: 1.2,
    wobbleAmplitude: 1.2,
    motorSaturation: 1.5,
    trackingError: 1.2,
    highThrottleOscillation: 1.3,
  },
  overrides: {
    propwashPreferItermRelax: true,
    itermRelaxCutoff: 7,
    warnAggressiveFiltering: false,
    motorAuthorityLimited: false,
    expectedDtoPRatio: '~0.5:1',
  },
}

const xclassProfile: QuadProfile = {
  id: 'xclass',
  label: 'X-Class',
  description: '10"+ X-Class and heavy lifters',
  thresholds: {
    gyroNoise: 0.7,
    dtermNoise: 0.8,
    propwashAmplitude: 1.5,
    bouncebackOvershoot: 1.4,
    wobbleAmplitude: 1.4,
    motorSaturation: 2.0,
    trackingError: 1.4,
    highThrottleOscillation: 1.5,
  },
  overrides: {
    propwashPreferItermRelax: true,
    itermRelaxCutoff: 5,
    warnAggressiveFiltering: false,
    motorAuthorityLimited: true,
    expectedDtoPRatio: '~0.4:1',
  },
}

export const QUAD_PROFILES: Record<QuadSize, QuadProfile> = {
  whoop: whoopProfile,
  toothpick3: toothpick3Profile,
  five_inch: fiveInchProfile,
  seven_inch: sevenInchProfile,
  xclass: xclassProfile,
}

export const DEFAULT_PROFILE = fiveInchProfile

export const QUAD_SIZE_ORDER: QuadSize[] = [
  'whoop',
  'toothpick3',
  'five_inch',
  'seven_inch',
  'xclass',
]
