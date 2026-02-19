# Betaflight Tuning Skill — Log-Based Tuning Reference

Expert knowledge for analyzing Betaflight Blackbox logs and translating observations into PID/filter/parameter changes. This document is the tuning brain behind the Betaflight Tuning Helper app.

---

## Table of Contents

1. [Blackbox Log Fundamentals](#1-blackbox-log-fundamentals)
2. [PID Controller Theory for Betaflight](#2-pid-controller-theory-for-betaflight)
3. [Filter System](#3-filter-system)
4. [Log-Based Issue Identification](#4-log-based-issue-identification)
5. [Hardware & Physical Issues Diagnosable from Logs](#5-hardware--physical-issues-diagnosable-from-logs)
6. [Tuning Workflow](#6-tuning-workflow)
7. [Parameter Reference](#7-parameter-reference)
8. [Frame & Hardware Considerations](#8-frame--hardware-considerations)
9. [Mapping to App Rules](#9-mapping-to-app-rules)

---

## 1. Blackbox Log Fundamentals

### Key Signals in a Blackbox Log

| Signal | What it is | What to look for |
|--------|-----------|-----------------|
| **gyro[roll/pitch/yaw]** | Raw angular rate from IMU | Noise floor, oscillation frequency, response shape |
| **setpoint[roll/pitch/yaw]** | Desired angular rate from sticks | Comparison target — gyro should track this |
| **axisP/I/D[roll/pitch/yaw]** | PID term outputs | Which term is doing the work, which is causing noise |
| **motor[0-3]** | Motor output values (0-100%) | Saturation, asymmetry, noise passthrough |
| **rcCommand[throttle]** | Throttle position | Flight phase context — hover, cruise, punch |
| **debug[]** | Configurable debug channels | FFT data, filter output, rpm values depending on debug mode |

### Reading the Gyro Trace

- **Clean gyro**: Thin trace, minimal fuzz. The noise floor is low.
- **Noisy gyro**: Thick/fuzzy trace. High-frequency vibration from motors/props/frame.
- **Oscillation**: Periodic waveform visible — the frequency tells you the source.
  - **< 20 Hz**: Likely I-term windup, mechanical looseness, or low-frequency frame resonance
  - **20-80 Hz**: P-term oscillation, bounceback, propwash
  - **80-150 Hz**: Motor/prop resonance, needs filtering or mechanical fix
  - **150+ Hz**: Electrical noise, bearing noise, very high motor resonance

### Setpoint vs Gyro (Tracking)

The single most important comparison. Overlay setpoint and gyro:

- **Gyro tracks setpoint closely**: Tune is good on that axis.
- **Gyro overshoots setpoint**: P too high, or D too low (underdamped).
- **Gyro undershoots / lags behind setpoint**: P too low (overdamped), or too much filtering adding delay.
- **Gyro oscillates around setpoint after stop**: Bounceback — feedforward transition or D-min issue.
- **Phase lag visible**: Gyro follows setpoint but delayed — excessive filtering or low P.

### Motor Traces

- **All 4 motors relatively even**: Good mechanical balance.
- **One motor consistently higher**: CG offset, bent arm, weak motor, or bad prop.
- **Motors hitting 100%**: Saturation — quad physically can't do what PID asks. Reduce gains or throttle.
- **Motor traces very noisy/spiky**: PID noise passing through to motors, causing hot motors and premature wear.

---

## 2. PID Controller Theory for Betaflight

### P (Proportional)

- **What it does**: Pushes the quad toward the setpoint. Force is proportional to error.
- **Too high**: Oscillation (fast wobble), especially visible at stick center and after maneuvers. Warm/hot motors.
- **Too low**: Sluggish, mushy feel. Doesn't track setpoint well. Slow response to disturbances (wind, propwash).
- **Log signature of P oscillation**: Fast oscillation (30-80 Hz) in gyro trace that tracks with stick input. axisP trace is large and in-phase with the oscillation.

### I (Integral)

- **What it does**: Accumulates error over time. Corrects for persistent steady-state error (drift, wind, CG offset).
- **Too high**: Slow oscillation ("wobble"), bouncy/floaty feel, tendency to overshoot after long stick inputs. I-term windup on fast maneuvers.
- **Too low**: Drifts in hover, doesn't hold attitude in wind, uneven flip/roll rates.
- **Log signature of I problems**: Low-frequency oscillation (< 20 Hz) in gyro. axisI trace drifts and overcompensates. Visible as a slow "hunting" pattern.

### D (Derivative)

- **What it does**: Opposes rate of change — a damper. Predicts where error is going and brakes early.
- **Too high**: Hot motors, amplifies high-frequency noise (D is a high-pass amplifier), propwash response may actually get worse due to delayed motor response.
- **Too low**: Overshoot on fast moves, bounceback after flips, poor propwash handling.
- **Log signature of D issues**: axisD trace is very noisy/spiky (too high). Or gyro overshoots setpoint consistently on direction changes (too low).

### D-min (Dynamic D)

- **What it does**: D floats between D-min (low activity) and D (high activity). Gives clean flight at cruise while having full D available for active maneuvers.
- **D-min advance**: How aggressively D ramps up. Higher = more responsive to stick inputs.
- **Key insight**: If propwash is the main issue, raising D-min (the floor) is often better than raising D (the ceiling), because propwash happens during low-activity descents.

### Feedforward (FF)

- **What it does**: Adds a term based on stick movement speed (derivative of setpoint). Provides instant response without waiting for error to build.
- **Too high**: Overshoot on fast stick moves, jittery response on noisy RC link.
- **Too low**: Latency feeling, PID has to do all the work, feels sluggish on fast direction changes.
- **FF transition**: Controls how feedforward behaves during stick deceleration. Lower values reduce bounceback. Higher values keep response sharp.
- **FF smoothing (jitter_factor)**: Filters RC link noise from feedforward. Higher = smoother but more latency.

### TPA (Throttle PID Attenuation)

- **What it does**: Reduces PID gains (primarily P and D) at high throttle to prevent oscillation as motors become more responsive.
- **TPA rate**: How much to reduce (0 = disabled, 0.75 = 75% reduction at full throttle).
- **TPA breakpoint**: Throttle value where attenuation begins (typically 1250-1500).
- **Log signature**: Clean at low/mid throttle but oscillation appears above a certain throttle threshold.

---

## 3. Filter System

Betaflight's filter pipeline runs between the gyro and the PID controller (gyro filters) and after the PID D-term output (D-term filters).

### Gyro Filters

1. **Lowpass 1** (default: PT1 at ~275 Hz): First stage of noise removal.
2. **Lowpass 2** (default: PT1 at ~275 Hz): Second stage, catches what LP1 missed.
3. **Dynamic Notch Filter**: Automatically targets the strongest noise peaks (motor RPM harmonics). Adapts in real-time via FFT.
4. **RPM Filter**: Uses motor RPM telemetry to place notch filters exactly on motor harmonics. Most effective filter — minimal phase delay because it targets exactly the right frequencies.

### D-term Filters

1. **D-term Lowpass 1** (default: PT1 at ~150 Hz): Critical — D amplifies noise, so this catches it.
2. **D-term Lowpass 2** (default: PT1 at ~150 Hz): Additional filtering stage.

### Filter Tuning Philosophy

- **Filters add latency**. More filtering = more phase delay = slower PID response = worse propwash handling.
- **Goal**: Use the minimum filtering that keeps motors cool and noise acceptable.
- **RPM filter is king**: If available (requires bidirectional DShot), it allows raising or even disabling other filters because it's so precise.
- **Dynamic notch**: Good fallback when RPM filter isn't available. Wider = catches more but adds more latency.

### Log Signs of Filter Issues

- **Over-filtered**: Gyro trace is very smooth but tracking is poor (big phase lag between setpoint and gyro). Propwash is bad because PID can't react fast enough.
- **Under-filtered**: Gyro trace is noisy/fuzzy. Motor traces are spiky. Motors get hot. Listen for audible high-pitched motor whine.
- **Resonance not caught by filters**: Specific frequency peak visible in FFT that rises with throttle. Usually a motor or frame resonance.

---

## 4. Log-Based Issue Identification

### Propwash Oscillation

**What it is**: Oscillation when descending through own prop turbulence (dirty air).

**Log signature**:
- Occurs during throttle drops (rcCommand[throttle] decreasing)
- Gyro shows oscillation (typically 20-60 Hz) while setpoint is near zero
- Most visible on pitch and roll
- Motor outputs become uneven as PID fights the turbulence

**Causes & fixes** (in priority order):
1. **Raise D-min** — gives the damper more authority during low-activity descent
2. **Lower I-term relax cutoff** — prevents I-term from fighting propwash (which it can't win)
3. **Increase dynamic idle** — keeps props spinning faster, cleaner airflow
4. **Ensure RPM filter is working** — allows less overall filtering = faster PID response
5. **Reduce filtering** (if motors are cool) — less latency = faster correction

### Bounceback

**What it is**: Overshoot/oscillation when sticks return to center after a fast move (flip, roll, sharp turn).

**Log signature**:
- Setpoint returns to zero but gyro overshoots past zero and oscillates
- 1-3 visible oscillation cycles after the maneuver
- axisI may show windup — it accumulated during the move and overshoots

**Causes & fixes**:
1. **Lower feedforward transition** — less aggressive FF during deceleration
2. **Raise D / D-min** — more damping to absorb the overshoot
3. **Lower I-term relax cutoff** — I relaxes earlier during fast moves, reducing windup
4. **Check I value** — may be accumulating too aggressively

### Mid-Throttle Wobble

**What it is**: Low-frequency oscillation during steady forward flight or hover, no stick input.

**Log signature**:
- Slow oscillation (5-30 Hz) in gyro while setpoint is flat/zero
- Typically visible during mid-throttle cruise
- axisI may show a "hunting" pattern

**Causes & fixes by frequency band**:
- **Low frequency (< 15 Hz)**: I-term hunting. Reduce I, or check for mechanical issues (loose FC mount, wobbly motor).
- **Mid frequency (15-50 Hz)**: P oscillation. Reduce P, or increase D to damp it.
- **High frequency (50+ Hz)**: Filter issue — noise is getting through. Lower filter cutoffs or verify RPM filter.

### High-Throttle Oscillation

**What it is**: Oscillation that only appears at high throttle (punches, power loops).

**Log signature**:
- Clean at low/mid throttle
- Oscillation in gyro above ~70% throttle
- Often visible on all axes simultaneously

**Causes & fixes**:
1. **Increase TPA rate** — more gain reduction at high throttle
2. **Lower TPA breakpoint** — start reducing gains earlier
3. **Reduce P on affected axis** — if TPA alone doesn't fix it
4. **Check motor balance** — thrust imbalances magnify at high power

### Motor Saturation

**What it is**: One or more motors hitting max output, PID can't physically achieve the requested correction.

**Log signature**:
- motor[n] values at or near 100% for sustained periods
- Tracking error increases during saturation
- May see asymmetric saturation (e.g., motor 1 and 3 saturate but not 2 and 4)

**Causes & fixes**:
1. **Reduce master multiplier** — globally lower PID authority
2. **Increase TPA** — reduce authority at high throttle where saturation is most likely
3. **Reduce P and D** — less aggressive corrections
4. **Check physical setup** — CG balance, prop condition, motor health

### D-Term Noise

**What it is**: D-term amplifying high-frequency gyro noise and passing it to motors.

**Log signature**:
- axisD trace is very spiky/noisy
- Motor traces show the same noise pattern
- FFT of axisD shows energy above 100-150 Hz

**Causes & fixes**:
1. **Lower D-term filter cutoff** — catch more noise before it reaches motors
2. **Reduce D gain** — less amplification of noise
3. **Enable/verify RPM filter** — cleaner gyro signal means D has less noise to amplify
4. **Check hardware** — damaged props, loose motors, or frame resonance creating the noise

### Gyro Noise

**What it is**: Excessive broadband noise in the gyro signal.

**Log signature**:
- Thick/fuzzy gyro trace even at low throttle
- FFT shows elevated energy across wide frequency band
- Noise increases with throttle (motor-driven) or is constant (electrical/mounting issue)

**Causes & fixes**:
1. **Soft-mount FC** — if hard-mounted, vibrations pass directly through
2. **Balance props** — most common mechanical noise source
3. **Check motors** — bad bearings, bent shafts
4. **Increase gyro filter cutoffs** — only if the above are addressed; don't mask bad hardware
5. **Enable dynamic notch with wider range** — catch more resonant peaks

---

## 5. Hardware & Physical Issues Diagnosable from Logs

These are problems no amount of PID/filter tuning can fix. The log can reveal them, and the correct recommendation is a physical intervention — not a parameter change.

### Insufficient Motor Authority (Underpowered Setup)

**What it is**: The motors don't have enough thrust headroom for the quad's weight and the pilot's demands. The PID controller runs out of control authority.

**Log signature**:
- Motor outputs consistently high (70%+ average) during normal flight, not just punches
- Frequent saturation (100%) on one or more motors during moderate maneuvers — not just full-throttle punches
- Tracking error is large during active flying because PID literally can't push harder
- Asymmetric saturation: opposite motors both saturate during rolls/flips (PID is maxing out the differential)
- Motor output "compression" — the spread between highest and lowest motor narrows at higher throttle, leaving no room for corrections

**How to distinguish from bad PID tune**:
- Bad tune: saturation happens at specific throttle ranges or during specific events (oscillation driving motors to limit)
- Insufficient authority: saturation is pervasive across the flight, especially during ANY moderate maneuver

**Recommendation**: Not a software fix. User needs to:
- Use higher-KV motors or larger props
- Reduce all-up weight (lighter battery, lighter frame)
- Reduce motor_output_limit if set below 100%
- Consider that the build simply can't do the maneuvers being attempted

### Damaged or Dying Motor

**What it is**: One motor is mechanically degraded — higher resistance, worn bearings, demagnetized, or physically damaged.

**Log signature**:
- One motor consistently outputs significantly higher than the others at hover (>10-15% offset)
- The offset is constant regardless of maneuver — it's always motor N working harder
- May see increased noise on the axis that motor primarily affects
- In extreme cases: sudden spikes or dropouts in that motor's output
- Motor asymmetry doesn't correlate with stick input — it's a baseline offset

**How to distinguish from CG offset**:
- CG offset: two adjacent motors are higher (the "heavy" side). Offset is proportional to throttle.
- Bad motor: single motor is higher. Offset may be relatively constant or worsen with load.

**Recommendation**: Physical inspection. Spin each motor by hand feeling for roughness. Measure motor resistance with multimeter. Replace the suspect motor.

### Bad Motor Bearings

**What it is**: Worn or damaged bearings create vibration at specific frequencies tied to motor RPM.

**Log signature**:
- Narrow-band noise peak in gyro FFT that tracks linearly with throttle/RPM
- The peak is at 1x motor RPM frequency (fundamental) — not a harmonic
- Noise is worse on the axis closest to the affected motor
- RPM filter (if enabled) may partially mask this, but the underlying vibration is still there
- The noise peak may be broader/wider than a balanced motor's peak — bearings create "messy" vibration

**Recommendation**: Replace the motor or bearings. Spinning the motor by hand should reveal roughness, gritty feeling, or play in the shaft.

### Bent Motor Shaft

**What it is**: A bent shaft causes wobble at 1x RPM frequency, creating strong vibration.

**Log signature**:
- Very strong, clean peak at exactly 1x motor RPM in FFT
- Amplitude is unusually high compared to other motors' fundamental peaks
- Scales linearly and strongly with throttle
- Usually affects one axis more than others depending on which motor has the bent shaft

**Recommendation**: Visual inspection — spin the motor and watch the prop/bell for wobble. Replace shaft or motor.

### Unbalanced or Damaged Props

**What it is**: Props with weight imbalance or physical damage (nicks, bends, missing material) create vibration.

**Log signature**:
- Broadband noise increase that scales with throttle
- Noise floor elevation across a wide frequency range (not a single peak)
- All axes affected roughly equally (unlike a single bad motor)
- FFT shows elevated energy at 1x RPM across all motors — broad hump, not sharp peak
- Noise may be intermittent if a prop is cracked and flexing under load
- Sudden change in noise characteristics mid-flight = prop damage during flight

**How to distinguish from frame vibration**:
- Props: noise scales smoothly with throttle (RPM)
- Frame resonance: specific frequency that's excited at certain RPM bands but not others

**Recommendation**: Replace props. If the issue persists with fresh props, balance them with a prop balancer. Always check props after any crash.

### Center of Gravity (CG) Offset

**What it is**: The weight distribution is off-center, so some motors must work harder to maintain level flight.

**Log signature**:
- Two adjacent motors consistently higher output than the other two at hover
- The pattern is: if CG is shifted toward motors 1&2, motors 3&4 compensate by running higher
- Offset is proportional to throttle — larger at higher throttle
- I-term on the affected axis builds up to compensate for the constant error
- The offset is consistent across the entire flight, not transient

**How to quantify**:
- Hover motor average: if the spread between highest and lowest average motor output at hover is >8-10%, CG is significantly off
- The axis of the offset tells you which direction the weight is shifted

**Recommendation**: Move battery position. The battery is usually the heaviest single component and the primary CG adjustment. Shift it toward the lighter side.

### Frame Flex and Structural Resonance

**What it is**: The frame has a mechanical resonance at a specific frequency, or arms flex under load.

**Log signature**:
- Sharp, persistent peak in gyro FFT at a specific frequency that does NOT track with motor RPM
- The resonance may be excited more at certain throttle ranges (where motor RPM harmonics land on the frame's natural frequency)
- Often visible as a "spike" in the noise spectrum that stays at the same frequency regardless of throttle
- May affect one axis more than others (e.g., pitch if the arms flex forward/back)
- Arm flex specifically: increased noise on the axis perpendicular to the flexing arms, worsening under high-G loads

**How to distinguish from motor noise**:
- Motor noise: peak frequency shifts with throttle (RPM changes)
- Frame resonance: peak frequency stays constant, but amplitude changes with throttle

**Recommendation**: Stiffer frame (thicker carbon, reinforced arms), add bracing, or change prop/motor combo to avoid exciting the resonance. Frame resonance is a hard problem — sometimes the answer is a different frame.

### ESC Desync

**What it is**: An ESC momentarily loses sync with its motor, causing a brief loss of thrust.

**Log signature**:
- Sudden, brief motor output spike to maximum (ESC trying to recover) followed by a drop
- Corresponding sudden gyro disturbance — a sharp transient that doesn't match stick input
- May see the quad "twitch" or lose attitude momentarily
- Often happens during rapid throttle changes or at very low throttle (idle)
- If severe: motor output goes to zero briefly, then recovers

**How to distinguish from PID oscillation**:
- PID oscillation: periodic, repeating pattern
- Desync: isolated, sudden, non-periodic event with sharp onset

**Recommendation**:
- Increase motor timing in ESC firmware
- Raise dynamic idle (dyn_idle_min_rpm) to keep motors above desync-prone low RPM
- Update ESC firmware
- If persistent: ESC or motor may be damaged

### Voltage Sag / Weak Battery

**What it is**: Battery can't sustain voltage under load, causing motor performance to degrade.

**Log signature**:
- vbat (if logged) drops significantly under load and recovers when throttle is reduced
- Motor output values increase over the flight to achieve the same maneuvers (PID compensating for reduced motor authority)
- Performance visibly degrades in the second half of the flight — same stick inputs produce weaker gyro response
- Tracking quality worsens later in the flight compared to early
- In extreme cases: motor saturation events increase toward end of flight that weren't present at start

**Recommendation**:
- Use a battery with higher C-rating or lower internal resistance
- Reduce flight aggression on aging batteries
- This is NOT a tuning issue — it's a power supply limitation

### Electrical Noise / EMI

**What it is**: Electromagnetic interference from switching regulators, ESCs, video transmitters, or other electronics coupling into the gyro signal.

**Log signature**:
- Constant-frequency noise that does NOT change with throttle or RPM
- Often at specific frequencies related to switching regulators (100-500 kHz, but aliases down to gyro sample range)
- Present even at zero throttle / motors off (if source is VTX or other always-on electronics)
- May appear as a single sharp peak or a comb of peaks at regular intervals in FFT
- Noise floor is elevated even with props off — this is the key differentiator

**Recommendation**:
- Add capacitor to battery lead (if not already present)
- Route gyro wires away from high-current / switching noise sources
- Use shielded cables
- Power sensitive components from a filtered regulator
- Check for ground loops in wiring

### Loose Flight Controller Mount

**What it is**: FC is not securely mounted, allowing it to vibrate independently of the frame.

**Log signature**:
- Exaggerated low-frequency noise (< 50 Hz) in gyro that seems disproportionate to motor noise
- Noise characteristics change with G-forces — sudden spikes during direction changes as FC shifts on mount
- Inconsistent noise floor — sometimes clean, sometimes noisy, depending on how the FC is sitting
- If soft-mounted: excessive low-frequency oscillation that soft-mount is amplifying rather than isolating (resonance of the soft mount itself, typically 10-30 Hz)

**Recommendation**:
- Check and tighten mounting hardware
- If soft-mounted: ensure grommets are the right stiffness. Too soft = the mount itself resonates. Too hard = no isolation.
- Add foam padding for additional dampening
- Ensure no wires are pulling on the FC creating asymmetric stress

### Prop Strike Damage (Mid-Flight)

**What it is**: A prop contacts something during flight, damaging it and changing vibration characteristics.

**Log signature**:
- Sudden, dramatic change in noise characteristics at a specific point in the log
- Before the event: normal noise floor. After: significantly elevated noise
- The change is permanent for the rest of the flight (unlike a transient desync)
- May be accompanied by a large gyro/motor transient at the moment of impact
- One axis may be affected more than others depending on which prop was struck

**Recommendation**: Land immediately. Inspect all props and replace any that are damaged. Check motors for bent shafts from the impact.

### Motor / Prop Mismatch

**What it is**: Props are too heavy or aggressive for the motors, or motors are too weak for the prop size.

**Log signature**:
- Motors running hot (can't see in log directly, but high average motor output % is a proxy)
- Sluggish throttle response — gyro response lags behind throttle input more than expected
- Motor authority issues similar to "underpowered" but specifically caused by wrong component pairing
- Excessive current draw (if logged) relative to the maneuvers being performed
- Higher-than-expected noise because motors are straining

**Recommendation**: Match props to motor specifications. Use the motor manufacturer's recommended prop range. Going 1" size down on props is the easiest fix for an overly aggressive setup.

---

## 5b. Summary: Hardware Issue Detection Cheat Sheet

| Issue | Key Log Indicator | Software Fix? |
|-------|-------------------|---------------|
| Insufficient authority | Motors 70%+ average, pervasive saturation | No — lighter build or more powerful motors |
| Dying motor | Single motor 10%+ higher at hover | No — replace motor |
| Bad bearings | Narrow noise peak tracking RPM, one motor | No — replace motor/bearings |
| Bent shaft | Strong 1x RPM peak, one motor | No — replace shaft/motor |
| Bad props | Broadband noise scaling with throttle | No — replace/balance props |
| CG offset | Two adjacent motors higher at hover | No — move battery position |
| Frame resonance | Fixed-frequency FFT peak, doesn't track RPM | No — stiffer frame or avoid resonance |
| ESC desync | Sudden motor spike + gyro transient | Partially — raise idle, update firmware |
| Voltage sag | Performance degrades over flight, rising motor % | No — better battery |
| EMI | Constant noise even at zero throttle | No — fix wiring/shielding |
| Loose FC mount | Erratic low-freq noise, changes with G-force | No — fix mounting |
| Prop strike | Sudden permanent noise change mid-flight | No — replace damaged props |
| Motor/prop mismatch | High motor %, sluggish response, excess noise | No — match components |

---

## 6. Tuning Workflow

### Recommended Log Analysis Order

1. **Motor health check**: Are all 4 motors roughly balanced? Any saturating?
2. **Gyro noise floor**: How clean is the raw gyro? Sets the ceiling for how aggressive the tune can be.
3. **Tracking quality**: How well does gyro follow setpoint? This is the overall grade.
4. **Issue identification**: Propwash? Bounceback? Wobble? Oscillation at specific throttle?
5. **Frequency analysis (FFT)**: What frequencies are the problems at? This narrows causes.
6. **Parameter recommendations**: Based on all of the above, suggest specific changes.

### The Golden Rules of Tuning

1. **Fix hardware before software** — No amount of PID tuning fixes a broken prop or loose motor.
2. **One change at a time** — Change one parameter, fly, log, compare. Otherwise you can't attribute improvements.
3. **Filters first, PIDs second** — If the signal is noisy, PID tuning is fighting a losing battle.
4. **RPM filter changes everything** — With bidirectional DShot and RPM filtering, you can run much higher P and D with less filtering.
5. **Trust the motors** — If motors are cool after a hard flight, you likely have room to push gains higher. If they're hot, back off D first, then P.
6. **Context matters** — A 5" freestyle quad and a 5" race quad have very different ideal tunes. Frame, weight, prop choice, and flying style all affect what's optimal.

### Severity & Priority

When multiple issues exist, fix them in this priority:

**Hardware issues (fix first — tuning can't compensate):**
1. **ESC desync** (safety — can cause crash)
2. **Damaged motor / bent shaft** (will mask all other tuning)
3. **Bad props** (noise source makes everything else worse)
4. **Insufficient motor authority** (PID has nothing to work with)
5. **CG offset / voltage sag / loose mount** (creates persistent baseline problems)
6. **Frame resonance / EMI** (noise source that filtering is compensating for)

**Software tuning issues (fix after hardware is healthy):**
1. **Motor saturation** (safety — can cause desync/crash)
2. **High-frequency oscillation / excessive noise** (motor damage)
3. **High-throttle oscillation** (dangerous during power moves)
4. **Propwash** (most common complaint, moderate flight impact)
5. **Bounceback** (annoying but not dangerous)
6. **Tracking quality fine-tuning** (polish)

---

## 7. Parameter Reference

### PID Gains (per axis: roll, pitch, yaw)

| Parameter | Typical Range | Effect |
|-----------|--------------|--------|
| `pid_roll_p` / `pid_pitch_p` | 30-80 | Proportional response. Higher = snappier but riskier |
| `pid_roll_i` / `pid_pitch_i` | 40-120 | Integral correction. Higher = tighter hold but more windup risk |
| `pid_roll_d` / `pid_pitch_d` | 20-50 | Derivative damping. Higher = more damping but more noise |
| `pid_yaw_p` | 20-60 | Yaw proportional. Usually lower than roll/pitch |
| `pid_yaw_i` | 40-120 | Yaw integral |
| `pid_yaw_d` | 0-20 | Yaw derivative. Often set to 0 since yaw is slow axis |
| `d_min_roll` / `d_min_pitch` | 15-35 | Floor for dynamic D. Key for propwash |
| `d_min_advance` | 0-200 | How fast D ramps from d_min to D. 0 = disabled |
| `feedforward_roll` / `feedforward_pitch` | 50-200 | Stick prediction strength |
| `feedforward_transition` | 0-100 | FF behavior on stick deceleration. Lower = less bounceback |
| `feedforward_jitter_factor` | 5-20 | RC link noise filtering for FF |

### Filter Parameters

| Parameter | Typical Range | Effect |
|-----------|--------------|--------|
| `gyro_lpf1_static_hz` | 0-400 | Gyro lowpass 1 cutoff. 0 = disabled |
| `gyro_lpf2_static_hz` | 0-400 | Gyro lowpass 2 cutoff |
| `dterm_lpf1_static_hz` | 75-200 | D-term lowpass 1 cutoff |
| `dterm_lpf2_static_hz` | 75-200 | D-term lowpass 2 cutoff |
| `dyn_notch_count` | 1-5 | Number of dynamic notch filters |
| `dyn_notch_q` | 100-500 | Dynamic notch Q factor. Higher = narrower notch |
| `dyn_notch_min_hz` | 60-200 | Dynamic notch minimum frequency |
| `dyn_notch_max_hz` | 200-600 | Dynamic notch maximum frequency |
| `rpm_filter_harmonics` | 1-3 | Number of motor harmonics to filter |
| `rpm_filter_min_hz` | 50-150 | RPM filter minimum frequency |

### Other Key Parameters

| Parameter | Typical Range | Effect |
|-----------|--------------|--------|
| `tpa_rate` | 0-75 | PID reduction at high throttle (percentage) |
| `tpa_breakpoint` | 1200-1600 | Throttle value where TPA starts |
| `iterm_relax_cutoff` | 5-30 | I-term relax frequency. Lower = more relaxation on fast moves |
| `dyn_idle_min_rpm` | 20-60 | Minimum motor RPM. Higher = better propwash but more prop noise on descent |
| `motor_output_limit` | 50-100 | Maximum motor output percentage |
| `master_multiplier` | 0.5-1.5 | Global PID scaling factor. Quick overall adjustment |

---

## 8. Frame & Hardware Considerations

### Frame Type Affects Tune

- **Stretched X**: Pitch and roll behave differently. Pitch arm is longer = more leverage = may need lower P on pitch, or higher D.
- **True X / Squished X**: More symmetric. Roll and pitch can often share similar PIDs.
- **Dead cat**: Long-body. Similar to stretched X — pitch typically needs different tuning.
- **Cinewhoop (ducted)**: Ducts amplify propwash significantly. Usually needs high D-min, high dynamic idle, aggressive I-term relax.

### Prop Size & KV

- **High KV / small props**: More responsive, more noise. Needs more filtering, potentially lower P.
- **Low KV / large props**: Smoother, more inertia. Can run higher P, less filtering needed.
- **Damaged/unbalanced props**: Massive noise source. The first thing to check if gyro is noisy.

### FC Mounting

- **Soft-mounted (rubber grommets)**: Isolates FC from frame vibrations. Allows less aggressive filtering.
- **Hard-mounted**: All vibrations pass through. Needs more filtering. Consider adding foam or TPU standoffs.

### ESC Protocol

- **Bidirectional DShot**: Required for RPM filtering. If available, use it — single biggest tune improvement.
- **Regular DShot**: No RPM telemetry. Rely on dynamic notch filter instead.
- **ESC timing/frequency**: Higher DShot speed (600/1200) gives faster motor response.

---

## 9. Mapping to App Rules

How the tuning knowledge maps to the app's TuningRule implementations:

| Real-World Issue | App Rule | Key Detection Logic |
|-----------------|----------|-------------------|
| Propwash oscillation | `PropwashRule` | Low throttle + no stick input + gyro oscillation in extended window |
| Bounceback/overshoot | `BouncebackRule` | Setpoint returning to zero + gyro overshoot past zero |
| Mid-throttle wobble | `WobbleRule` | Mid-throttle + no stick input + low/mid/high freq oscillation |
| Bad setpoint tracking | `TrackingQualityRule` | Normalized error, amplitude ratio, phase lag, SNR metrics |
| Motor hitting limits | `MotorSaturationRule` | Motor output percentage + asymmetry detection |
| D-term amplifying noise | `DTermNoiseRule` | D-term high-frequency energy ratio + RMS values |
| Oscillation at high throttle | `HighThrottleOscillationRule` | Throttle > 1600 + oscillation on any axis |
| Excessive gyro noise | `GyroNoiseRule` | Mid-throttle + no stick input + gyro RMS + high-freq band ratio |

### Detection Pipeline

```
Raw Log Frames
  → Segment into 100ms windows (50% overlap)
  → Classify flight phase per window (idle/hover/cruise/punch/propwash/flip/roll)
  → Run relevant rules per window + axis
  → Temporal dedup (merge issues < 100ms apart)
  → Collapse to one issue per type+axis
  → Generate recommendations per issue
  → Dedup recommendations by parameter:axis key
  → Conflict resolution (weighted merge for opposing changes)
  → Output exact parameter values (CLI commands support arbitrary numbers)
```

### Confidence & Severity

- **Confidence**: How certain the detection is. Based on signal clarity, metric strength, consistency across windows.
- **Severity**: How bad the issue is. Critical (motor saturation, dangerous oscillation) > Warning (propwash, bounceback) > Info (minor tracking issues).
- Both affect recommendation priority. A high-confidence critical issue always takes precedence.

---

## Appendix: Quick Diagnostic Flowchart

```
Start: Load log
  │
  ╔══════════════════════════════════════════════╗
  ║  STEP 1: Hardware Health (fix before tuning) ║
  ╚══════════════════════════════════════════════╝
  │
  ├─ Noise present at zero throttle / motors off? → EMI / electrical noise → Fix wiring/shielding
  │
  ├─ One motor 10%+ higher at hover? → Dying motor or CG offset
  │   ├─ Single motor offset? → Bad motor → Replace it
  │   └─ Two adjacent motors higher? → CG offset → Move battery
  │
  ├─ Sharp FFT peak at fixed frequency (doesn't track RPM)? → Frame resonance → Stiffer frame
  │
  ├─ Sharp FFT peak tracking 1x RPM, one motor? → Bent shaft or bad bearings → Replace motor
  │
  ├─ Broadband noise scaling with throttle, all axes? → Bad/unbalanced props → Replace props
  │
  ├─ Sudden noise change mid-flight? → Prop strike → Land, replace props, check motors
  │
  ├─ Sudden motor spike + gyro transient (isolated event)? → ESC desync → Raise idle, update ESC FW
  │
  ├─ Motors 70%+ average, pervasive saturation? → Underpowered → Lighter build / stronger motors
  │
  ├─ Performance degrades over flight? → Voltage sag → Better battery
  │
  ├─ Erratic low-freq noise changing with G-forces? → Loose FC mount → Fix mounting
  │
  ╔══════════════════════════════════════╗
  ║  STEP 2: Software Tuning Issues      ║
  ╚══════════════════════════════════════╝
  │
  ├─ Motors hitting 100%? → Motor Saturation → Reduce gains / master multiplier
  │
  ├─ Motors very noisy? → Check gyro noise
  │   ├─ Gyro noisy? → Filter tuning needed
  │   └─ Gyro clean? → D-term noise → Lower D or D-term filter
  │
  ├─ Oscillation at high throttle only? → TPA issue → Increase TPA rate / lower breakpoint
  │
  ├─ Oscillation during descent? → Propwash → Raise D-min, I-term relax, dynamic idle
  │
  ├─ Oscillation after flips/rolls? → Bounceback → Lower FF transition, raise D
  │
  ├─ Slow wobble in hover/cruise? → I-term or P issue
  │   ├─ Low frequency (< 15 Hz)? → Reduce I
  │   └─ Mid frequency (15-50 Hz)? → Reduce P or raise D
  │
  └─ Sluggish/laggy response? → Overdamped
      ├─ Too much filtering? → Raise filter cutoffs (if motors are cool)
      └─ P too low? → Raise P
```
