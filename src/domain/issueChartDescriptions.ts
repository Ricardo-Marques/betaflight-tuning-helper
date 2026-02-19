import { IssueType } from './types/Analysis'

/**
 * Plain-English descriptions of what each issue type looks like on the chart,
 * referencing specific trace names the user can enable.
 */
export const ISSUE_CHART_DESCRIPTIONS: Record<IssueType, string> = {
  bounceback:
    'After a sharp stick input, the gyro line overshoots the setpoint and swings back the other way before settling. You may see one or more oscillations around the target. Enable Setpoint and Gyro to compare - the gyro should follow the setpoint closely, but here it rings past it.',

  propwash:
    'When throttle drops after a move (e.g. flip or dive recovery), the gyro shows rapid oscillations that weren\'t commanded by the setpoint. These bursts appear as jagged spikes in the gyro trace while the setpoint stays relatively flat. The motors may show corresponding rapid corrections.',

  midThrottleWobble:
    'At mid-throttle cruise, the gyro trace shows a persistent low-frequency wobble or weaving that doesn\'t match the setpoint. The setpoint may be nearly flat while the gyro drifts back and forth. Motors will show gentle counter-corrections trying to compensate.',

  highFrequencyNoise:
    'The gyro trace appears thick or fuzzy with high-frequency jitter riding on top of the actual signal. Enable D-term to see if it\'s amplifying this noise - if D-term looks spiky or noisy, the noise is being fed into the PID loop. Motors may show rapid micro-corrections.',

  lowFrequencyOscillation:
    'The gyro shows a slow, rhythmic oscillation (visible as smooth waves) not commanded by the setpoint. This is different from noise - it\'s a clear, repeating pattern. Motors will oscillate in sync trying to correct it.',

  motorSaturation:
    'One or more motor traces hit 100% (the top of their range) and clip flat. While saturated, the quad can\'t correct further - the gyro may diverge from the setpoint during these flat-top motor sections because there\'s no headroom left for corrections.',

  gyroNoise:
    'The gyro trace shows rapid, erratic jumps - the values swing up and down more than in cleaner sections of the flight. Compare a calm section to the flagged one: you\'ll see the gyro bouncing around with larger amplitude swings even when no stick input is happening. This noise feeds into PID calculations and can cause motor heat and reduced performance.',

  dtermNoise:
    'Enable the D-term trace - it will look excessively spiky or noisy in the flagged region. D-term amplifies high-frequency gyro changes, so noisy gyro produces an even noisier D output. The motors may show high-frequency chatter as a result.',

  highThrottleOscillation:
    'At high throttle (punch-outs or fast climbs), the gyro develops oscillations not present at lower throttle. Look for the gyro trace becoming wavy or ringy specifically when motors are running hot. The oscillation may appear as a clear sine-wave pattern on top of the commanded movement.',

  underdamped:
    'The gyro overshoots the setpoint - when the setpoint steps to a new value, the gyro goes past it before coming back. Look for the gyro peak exceeding the setpoint peak, or ringing (multiple small overshoots) after quick moves. Compare the two traces: the gyro "bounces" beyond where the setpoint asked it to go.',

  overdamped:
    'The gyro never quite reaches the setpoint - it responds sluggishly and falls short of the commanded value. Look for the gyro peak being noticeably lower than the setpoint peak on quick stick moves. The quad is under-responding, making it feel soft or mushy.',
}
