import { IssueType } from './types/Analysis'

/**
 * Plain-English descriptions of what each issue type looks like on the chart,
 * referencing specific trace names the user can enable.
 */
export const ISSUE_CHART_DESCRIPTIONS: Record<IssueType, string> = {
  bounceback:
    'On the Gyro trace, look for the line overshooting the Setpoint and swinging back the other way after a sharp stick input. You may see one or more oscillations around the target before it settles. Enable both Setpoint and Gyro to compare - the gyro should follow the setpoint closely, but here it rings past it.',

  propwash:
    'On the Gyro trace, look for rapid oscillation bursts that appear as jagged spikes - these happen when throttle drops after a move (e.g. flip or dive recovery). The Setpoint stays relatively flat while the gyro is spiking, showing these oscillations weren\'t commanded. The Motor traces may show corresponding rapid corrections.',

  midThrottleWobble:
    'On the Gyro trace, look for a persistent low-frequency wobble or weaving during mid-throttle cruise. The Setpoint may be nearly flat while the gyro drifts back and forth, showing the wobble isn\'t commanded. The Motor traces will show gentle counter-corrections trying to compensate.',

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
    'On the Gyro trace, look for oscillations that appear specifically when the Motor traces are at high output (punch-outs or fast climbs). The gyro becomes wavy or ringy in a way not present at lower throttle. The oscillation may appear as a clear sine-wave pattern on top of the commanded movement.',

  underdamped:
    'The gyro overshoots the setpoint - when the setpoint steps to a new value, the gyro goes past it before coming back. Look for the gyro peak exceeding the setpoint peak, or ringing (multiple small overshoots) after quick moves. Compare the two traces: the gyro "bounces" beyond where the setpoint asked it to go.',

  overdamped:
    'The gyro never quite reaches the setpoint - it responds sluggishly and falls short of the commanded value. Look for the gyro peak being noticeably lower than the setpoint peak on quick stick moves. The quad is under-responding, making it feel soft or mushy.',

  overFiltering:
    'The gyro follows the setpoint shape but with a visible delay - the peaks arrive late and the response feels sluggish. This is different from overdamped: the amplitude may be fine, but everything is shifted in time. The gyro noise floor is already clean, meaning more filtering isn\'t needed.',

  cgOffset:
    'On the Motor traces, look for a consistent imbalance during hover - one diagonal pair runs significantly higher than the other. All four motors should be roughly equal during steady hover, but the offset pair is compensating for the shifted center of gravity.',

  motorImbalance:
    'One motor trace consistently runs higher than the others across the flight. Unlike CG offset (which affects two diagonal motors), this is a single motor working harder - suggesting a prop, bearing, or motor issue on that specific corner.',

  bearingNoise:
    'The gyro trace shows a narrow-band vibration that changes pitch with throttle. As motors speed up, this noise peak shifts to higher frequency. It appears as a consistent "hum" in the gyro that intensifies at certain throttle positions.',

  frameResonance:
    'The gyro shows a persistent vibration at one specific frequency regardless of throttle. Unlike motor noise (which shifts with RPM), this stays fixed - it\'s the frame\'s natural vibration frequency being excited by motor activity.',

  electricalNoise:
    'On the Gyro trace, look for noise present at idle when the motors are barely spinning. Mechanical vibrations are minimal at idle, so this noise shouldn\'t be there - it\'s electrical interference from ESCs, wiring, or the gyro chip itself.',

  escDesync:
    'A single motor trace shows a sudden, dramatic spike - jumping from normal output to near-maximum and back within one or two frames. The other motors don\'t show this spike, and it\'s not correlated with any stick input. This is the ESC briefly losing motor synchronization.',

  voltageSag:
    'On the Motor traces, look for outputs that are noticeably higher later in the flight compared to early sections at similar throttle positions. The battery voltage is dropping, forcing motors to work harder to maintain the same thrust for the same throttle command.',
}
