export interface GlossaryEntry {
  id: string
  term: string
  category: 'units' | 'abbreviations' | 'concepts'
  explanation: string
  detail?: string
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  // Units
  {
    id: 'rms',
    term: 'RMS',
    category: 'units',
    explanation: 'Root Mean Square  - a way to measure average signal strength that accounts for both positive and negative values.',
    detail: 'Higher RMS means more overall activity. Used to quantify noise and vibration levels.',
  },
  {
    id: 'deg-per-s',
    term: '\u00b0/s',
    category: 'units',
    explanation: 'Degrees per second  - how fast the quad is rotating.',
    detail: 'A value of 500\u00b0/s means the quad completes a full flip in about 0.7 seconds.',
  },
  {
    id: 'hz',
    term: 'Hz',
    category: 'units',
    explanation: 'Hertz  - cycles per second. Measures how fast something vibrates or repeats.',
    detail: 'Low frequencies (10\u201350 Hz) are slow wobbles. High frequencies (200+ Hz) are motor vibrations.',
  },
  {
    id: 'db',
    term: 'dB',
    category: 'units',
    explanation: 'Decibels  - a logarithmic scale for comparing signal levels.',
    detail: 'Every 6 dB roughly doubles the amplitude. Used in spectrum analysis to show noise intensity.',
  },
  {
    id: 'ms',
    term: 'ms',
    category: 'units',
    explanation: 'Milliseconds  - thousandths of a second.',
    detail: 'Betaflight PID loop runs every 0.125\u20131 ms. RC link latency is typically 5\u201325 ms.',
  },

  // Abbreviations
  {
    id: 'ff',
    term: 'FF',
    category: 'abbreviations',
    explanation: 'Feedforward  - a PID component that predicts what the quad should do based on your stick movement.',
    detail: 'Unlike P/I/D which react to errors, FF acts immediately on stick input for sharper response.',
  },
  {
    id: 'pid',
    term: 'PID',
    category: 'abbreviations',
    explanation: 'Proportional\u2013Integral\u2013Derivative  - the three-part control algorithm that keeps your quad stable.',
    detail: 'P reacts to current error, I corrects accumulated drift, D dampens overshoot.',
  },
  {
    id: 'tpa',
    term: 'TPA',
    category: 'abbreviations',
    explanation: 'Throttle PID Attenuation  - automatically reduces D-term strength at high throttle to prevent oscillations.',
    detail: 'At full throttle, motors are more responsive and can amplify D-term noise into audible oscillation.',
  },
  {
    id: 'esc',
    term: 'ESC',
    category: 'abbreviations',
    explanation: 'Electronic Speed Controller  - the circuit board that drives each motor.',
    detail: 'ESCs convert the flight controller\u2019s commands into the precise current pulses that spin the motors.',
  },
  {
    id: 'rpm',
    term: 'RPM',
    category: 'abbreviations',
    explanation: 'Revolutions Per Minute  - how fast the motors are spinning.',
    detail: 'Betaflight can use RPM data to place notch filters exactly on motor noise frequencies.',
  },
  {
    id: 'cg',
    term: 'CG',
    category: 'abbreviations',
    explanation: 'Center of Gravity - the balance point of the quad.',
    detail: 'If the CG is off-center, some motors work harder than others, causing uneven wear and reduced flight performance.',
  },
  {
    id: 'lpf',
    term: 'LPF',
    category: 'abbreviations',
    explanation: 'Low-Pass Filter  - removes high-frequency noise while keeping the actual flight signal.',
    detail: 'Lower cutoff = more filtering (smoother but slower response). Higher cutoff = less filtering (faster but noisier).',
  },

  // Concepts
  {
    id: 'p-term',
    term: 'P-term',
    category: 'concepts',
    explanation: 'The Proportional component of PID. Pushes the quad toward the target  - bigger error means bigger correction.',
    detail: 'Too high: oscillation/overshoot. Too low: sluggish, mushy feel.',
  },
  {
    id: 'i-term',
    term: 'I-term',
    category: 'concepts',
    explanation: 'The Integral component of PID. Slowly builds up correction to eliminate persistent drift or steady-state error.',
    detail: 'Too high: slow wobble, especially after flips. Too low: drift in wind or uneven hover.',
  },
  {
    id: 'd-term',
    term: 'D-term',
    category: 'concepts',
    explanation: 'The Derivative component of PID. Acts as a brake to dampen sudden changes and prevent overshoot.',
    detail: 'Too high: hot motors, vibrations, noise amplification. Too low: bouncy, overshooty feel.',
  },
  {
    id: 'setpoint',
    term: 'Setpoint',
    category: 'concepts',
    explanation: 'The target rotation rate your sticks are commanding. The PID controller tries to match the gyro to this value.',
  },
  {
    id: 'gyro',
    term: 'Gyro',
    category: 'concepts',
    explanation: 'The gyroscope sensor that measures the quad\u2019s actual rotation rate in degrees per second.',
    detail: 'The difference between gyro (actual) and setpoint (target) is the error that PID tries to correct.',
  },
  {
    id: 'pid-sum',
    term: 'PID Sum',
    category: 'concepts',
    explanation: 'The combined output of P + I + D terms. This is the final correction signal sent to the motors.',
  },
  {
    id: 'propwash',
    term: 'Propwash',
    category: 'concepts',
    explanation: 'Turbulence from the quad flying through its own disturbed air, typically after quick altitude changes.',
    detail: 'Causes visible jello or wobble on video. Reducing D-term and increasing motor authority helps.',
  },
  {
    id: 'bounceback',
    term: 'Bounceback',
    category: 'concepts',
    explanation: 'When the quad overshoots and then oscillates back after a quick move or flip.',
    detail: 'Usually caused by I-term wind-up or excessive P gain. Visible as the quad "bouncing" at the end of a maneuver.',
  },
  {
    id: 'resonance',
    term: 'Resonance',
    category: 'concepts',
    explanation: 'A frequency at which vibrations amplify instead of dying out. The frame or props vibrate at their natural frequency.',
    detail: 'Shows up as a sharp spike in the noise spectrum. Notch filters can target specific resonant frequencies.',
  },
  {
    id: 'harmonics',
    term: 'Harmonics',
    category: 'concepts',
    explanation: 'Noise at exact multiples of a base frequency (e.g. if motors spin at 200 Hz, harmonics appear at 400, 600 Hz, etc.).',
  },
  {
    id: 'motor-saturation',
    term: 'Motor saturation',
    category: 'concepts',
    explanation: 'When a motor hits 100% throttle and can\u2019t provide more thrust. The flight controller loses authority on that corner.',
    detail: 'Causes instability and potential crashes at extreme maneuvers or high throttle.',
  },
  {
    id: 'cutoff-frequency',
    term: 'Cutoff frequency',
    category: 'concepts',
    explanation: 'The frequency where a filter starts reducing the signal. Below this frequency, signals pass through mostly unchanged.',
    detail: 'Higher cutoff = less filtering, faster response. Lower cutoff = more filtering, more latency.',
  },
  {
    id: 'phase-delay',
    term: 'Phase delay',
    category: 'concepts',
    explanation: 'The time lag introduced by filters. More filtering means the flight controller reacts slightly later to real changes.',
    detail: 'Excessive phase delay makes the quad feel sluggish and can cause oscillations at certain frequencies.',
  },
  {
    id: 'damping',
    term: 'Damping',
    category: 'concepts',
    explanation: 'How quickly oscillations die out. Good damping means the quad settles quickly after a disturbance.',
    detail: 'D-term provides damping in PID tuning. Soft-mounted components provide physical damping.',
  },
  {
    id: 'dynamic-idle',
    term: 'Dynamic idle',
    category: 'concepts',
    explanation: 'A Betaflight feature that raises motor idle speed when the quad needs more control authority at low throttle.',
    detail: 'Helps prevent desync and improves stability during descents and inverted maneuvers.',
  },
  {
    id: 'q-factor',
    term: 'Q-factor',
    category: 'concepts',
    explanation: 'How narrow a notch filter is. Higher Q = narrower notch (removes less signal, but must be precisely aimed).',
    detail: 'Low Q is safer (catches a wider range) but adds more phase delay.',
  },
  {
    id: 'high-freq-energy',
    term: 'High-freq energy',
    category: 'concepts',
    explanation: 'The amount of noise above ~150 Hz, typically from motors, props, or electrical interference.',
    detail: 'High levels cause hot motors and can feed back into the PID loop if not filtered properly.',
  },
]

export const GLOSSARY_BY_ID = new Map(GLOSSARY_ENTRIES.map(e => [e.id, e]))

export const GLOSSARY_CATEGORIES = ['units', 'abbreviations', 'concepts'] as const
export const GLOSSARY_CATEGORY_LABELS: Record<string, string> = {
  units: 'Units',
  abbreviations: 'Abbreviations',
  concepts: 'Concepts',
}
