/**
 * Betaflight CLI option definitions.
 * Source: Betaflight 4.5 CLI `get` dump.
 *
 * Helper legend:  _e = enum,  _r = range,  _a = array,  _s = string
 * Scope shortcuts: P = profile (PID),  R = rateprofile
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CliOptionScope = 'global' | 'profile' | 'rateprofile'

export interface EnumCliOption {
  type: 'enum'
  values: string[]
  default?: string
  scope: CliOptionScope
}

export interface RangeCliOption {
  type: 'range'
  min: number
  max: number
  default?: number
  scope: CliOptionScope
}

export interface ArrayCliOption {
  type: 'array'
  length: number
  default?: string
  scope: CliOptionScope
}

export interface StringCliOption {
  type: 'string'
  minLength: number
  maxLength: number
  default?: string
  scope: CliOptionScope
}

export type CliOption = EnumCliOption | RangeCliOption | ArrayCliOption | StringCliOption

// ---------------------------------------------------------------------------
// Compact constructors (file-private)
// ---------------------------------------------------------------------------

const P: CliOptionScope = 'profile'
const R: CliOptionScope = 'rateprofile'

const _e = (values: string[], def?: string, scope: CliOptionScope = 'global'): EnumCliOption => ({
  type: 'enum', values, scope, ...(def != null && { default: def }),
})
const _r = (min: number, max: number, def?: number, scope: CliOptionScope = 'global'): RangeCliOption => ({
  type: 'range', min, max, scope, ...(def != null && { default: def }),
})
const _a = (length: number, def?: string, scope: CliOptionScope = 'global'): ArrayCliOption => ({
  type: 'array', length, scope, ...(def != null && { default: def }),
})
const _s = (min: number, max: number, def?: string, scope: CliOptionScope = 'global'): StringCliOption => ({
  type: 'string', minLength: min, maxLength: max, scope, ...(def != null && { default: def }),
})

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const CLI_OPTIONS: Record<string, CliOption> = {

  // --- Gyro filters ---
  gyro_hardware_lpf: _e(['NORMAL', 'OPTION_1', 'OPTION_2', 'EXPERIMENTAL']),
  gyro_lpf1_type: _e(['PT1', 'BIQUAD', 'PT2', 'PT3']),
  gyro_lpf1_static_hz: _r(0, 1000, 250),
  gyro_lpf2_type: _e(['PT1', 'BIQUAD', 'PT2', 'PT3']),
  gyro_lpf2_static_hz: _r(0, 1000, 500),
  gyro_notch1_hz: _r(0, 1000),
  gyro_notch1_cutoff: _r(0, 1000),
  gyro_notch2_hz: _r(0, 1000),
  gyro_notch2_cutoff: _r(0, 1000),
  gyro_calib_duration: _r(50, 3000),
  gyro_calib_noise_limit: _r(0, 200),
  gyro_offset_yaw: _r(-1000, 1000),
  gyro_overflow_detect: _e(['OFF', 'YAW', 'ALL']),
  yaw_spin_recovery: _e(['OFF', 'ON', 'AUTO']),
  yaw_spin_threshold: _r(500, 1950),
  gyro_to_use: _e(['FIRST', 'SECOND', 'BOTH']),
  dyn_notch_count: _r(0, 5, 3),
  dyn_notch_q: _r(1, 1000),
  dyn_notch_min_hz: _r(20, 250, 100),
  dyn_notch_max_hz: _r(200, 1000, 600),
  gyro_lpf1_dyn_min_hz: _r(0, 1000, 250),
  gyro_lpf1_dyn_max_hz: _r(0, 1000, 500),
  gyro_lpf1_dyn_expo: _r(0, 10),
  gyro_filter_debug_axis: _e(['ROLL', 'PITCH', 'YAW']),

  // --- Accelerometer ---
  acc_hardware: _e(['AUTO', 'NONE', 'ADXL345', 'MPU6050', 'MMA8452', 'BMA280', 'LSM303DLHC', 'MPU6000', 'MPU6500', 'MPU9250', 'ICM20601', 'ICM20602', 'ICM20608G', 'ICM20649', 'ICM20689', 'ICM42605', 'ICM42688P', 'BMI160', 'BMI270', 'LSM6DSO', 'LSM6DSV16X', 'VIRTUAL']),
  acc_lpf_hz: _r(0, 500),
  acc_trim_pitch: _r(-300, 300),
  acc_trim_roll: _r(-300, 300),
  acc_calibration: _a(4, '0,0,0,0'),

  // --- Barometer ---
  baro_bustype: _e(['NONE', 'I2C', 'SPI', 'SLAVE']),
  baro_spi_device: _r(0, 5),
  baro_i2c_device: _r(0, 5),
  baro_i2c_address: _r(0, 119),
  baro_hardware: _e(['AUTO', 'NONE', 'BMP085', 'MS5611', 'BMP280', 'LPS', 'QMP6988', 'BMP388', 'DPS310', '2SMPB_02B', 'LPS22DF', 'VIRTUAL']),

  // --- RC / RSSI ---
  mid_rc: _r(1200, 1700),
  min_check: _r(750, 2250),
  max_check: _r(750, 2250),
  rssi_channel: _r(0, 18),
  rssi_src_frame_errors: _e(['OFF', 'ON']),
  rssi_scale: _r(1, 255),
  rssi_offset: _r(-100, 100),
  rssi_invert: _e(['OFF', 'ON']),
  rssi_src_frame_lpf_period: _r(0, 255),
  rssi_smoothing: _r(0, 255),

  // --- RC Smoothing ---
  rc_smoothing: _e(['OFF', 'ON']),
  rc_smoothing_auto_factor: _r(0, 250),
  rc_smoothing_auto_factor_throttle: _r(0, 250),
  rc_smoothing_setpoint_cutoff: _r(0, 255),
  rc_smoothing_feedforward_cutoff: _r(0, 255),
  rc_smoothing_throttle_cutoff: _r(0, 255),
  rc_smoothing_debug_axis: _e(['ROLL', 'PITCH', 'YAW', 'THROTTLE']),

  // --- Receiver ---
  fpv_mix_degrees: _r(0, 90),
  max_aux_channels: _r(0, 14),
  serialrx_provider: _e(['NONE', 'SPEK2048', 'SBUS', 'SUMD', 'SUMH', 'XB-B', 'XB-B-RJ01', 'IBUS', 'JETIEXBUS', 'CRSF', 'SRXL', 'CUSTOM', 'FPORT', 'SRXL2', 'GHST', 'SPEK1024']),
  serialrx_inverted: _e(['OFF', 'ON']),
  crsf_use_negotiated_baud: _e(['OFF', 'ON']),
  airmode_start_throttle_percent: _r(0, 100),
  rx_min_usec: _r(750, 2250),
  rx_max_usec: _r(750, 2250),
  serialrx_halfduplex: _e(['OFF', 'ON']),
  msp_override_channels_mask: _r(0, 262143),
  msp_override_failsafe: _e(['OFF', 'ON']),

  // --- ADC ---
  adc_device: _r(0, 3),
  adc_vrefint_calibration: _r(0, 2000),
  adc_tempsensor_calibration30: _r(0, 2000),
  adc_tempsensor_calibration110: _r(0, 2000),

  // --- Blackbox ---
  blackbox_sample_rate: _e(['1/1', '1/2', '1/4', '1/8', '1/16']),
  blackbox_device: _e(['NONE', 'SPIFLASH', 'SDCARD', 'SERIAL']),
  blackbox_disable_pids: _e(['OFF', 'ON']),
  blackbox_disable_rc: _e(['OFF', 'ON']),
  blackbox_disable_setpoint: _e(['OFF', 'ON']),
  blackbox_disable_bat: _e(['OFF', 'ON']),
  blackbox_disable_alt: _e(['OFF', 'ON']),
  blackbox_disable_rssi: _e(['OFF', 'ON']),
  blackbox_disable_gyro: _e(['OFF', 'ON']),
  blackbox_disable_gyrounfilt: _e(['OFF', 'ON']),
  blackbox_disable_acc: _e(['OFF', 'ON']),
  blackbox_disable_debug: _e(['OFF', 'ON']),
  blackbox_disable_motors: _e(['OFF', 'ON']),
  blackbox_disable_rpm: _e(['OFF', 'ON']),
  blackbox_disable_gps: _e(['OFF', 'ON']),
  blackbox_mode: _e(['NORMAL', 'MOTOR_TEST', 'ALWAYS']),
  blackbox_high_resolution: _e(['OFF', 'ON']),

  // --- Motor / ESC ---
  min_throttle: _r(750, 2250),
  max_throttle: _r(750, 2250),
  min_command: _r(750, 2250),
  motor_kv: _r(1, 40000),
  dshot_idle_value: _r(0, 2000),
  dshot_burst: _e(['OFF', 'ON', 'AUTO']),
  dshot_bidir: _e(['OFF', 'ON']),
  dshot_edt: _e(['OFF', 'ON']),
  dshot_bitbang: _e(['OFF', 'ON', 'AUTO']),
  dshot_bitbang_timer: _e(['AUTO', 'TIM1', 'TIM8']),
  use_unsynced_pwm: _e(['OFF', 'ON']),
  motor_pwm_protocol: _e(['PWM', 'ONESHOT125', 'ONESHOT42', 'MULTISHOT', 'BRUSHED', 'DSHOT150', 'DSHOT300', 'DSHOT600', 'PROSHOT1000', 'DISABLED']),
  motor_pwm_rate: _r(200, 32000),
  motor_pwm_inversion: _e(['OFF', 'ON']),
  motor_poles: _r(4, 255),
  motor_output_reordering: _a(8),
  thr_corr_value: _r(0, 150),
  thr_corr_angle: _r(1, 900),

  // --- Failsafe ---
  failsafe_delay: _r(1, 200),
  failsafe_off_delay: _r(0, 200),
  failsafe_throttle: _r(750, 2250),
  failsafe_switch_mode: _e(['STAGE1', 'KILL', 'STAGE2']),
  failsafe_throttle_low_delay: _r(0, 300),
  failsafe_procedure: _e(['AUTO-LAND', 'DROP', 'GPS-RESCUE'], 'DROP'),
  failsafe_recovery_delay: _r(1, 200),
  failsafe_stick_threshold: _r(0, 50),

  // --- Board alignment ---
  align_board_roll: _r(-180, 360),
  align_board_pitch: _r(-180, 360),
  align_board_yaw: _r(-180, 360),

  // --- Battery ---
  bat_capacity: _r(0, 20000),
  vbat_max_cell_voltage: _r(100, 500),
  vbat_full_cell_voltage: _r(100, 500),
  vbat_min_cell_voltage: _r(100, 500),
  vbat_warning_cell_voltage: _r(100, 500),
  vbat_hysteresis: _r(0, 250),
  current_meter: _e(['NONE', 'ADC', 'VIRTUAL', 'ESC', 'MSP']),
  battery_meter: _e(['NONE', 'ADC', 'ESC']),
  vbat_detect_cell_voltage: _r(0, 2000),
  use_vbat_alerts: _e(['OFF', 'ON']),
  use_cbat_alerts: _e(['OFF', 'ON']),
  cbat_alert_percent: _r(0, 100),
  vbat_cutoff_percent: _r(0, 100),
  force_battery_cell_count: _r(0, 24),
  vbat_display_lpf_period: _r(1, 255),
  vbat_sag_lpf_period: _r(1, 255),
  ibat_lpf_period: _r(0, 255),
  vbat_duration_for_warning: _r(0, 150),
  vbat_duration_for_critical: _r(0, 150),
  vbat_scale: _r(0, 255),
  vbat_divider: _r(1, 255),
  vbat_multiplier: _r(1, 255),
  ibata_scale: _r(-16000, 16000),
  ibata_offset: _r(-32000, 32000),
  ibatv_scale: _r(-16000, 16000),
  ibatv_offset: _r(0, 16000),

  // --- Beeper ---
  beeper_inversion: _e(['OFF', 'ON']),
  beeper_od: _e(['OFF', 'ON']),
  beeper_frequency: _r(0, 16000),
  beeper_dshot_beacon_tone: _r(1, 5),

  // --- Mixer ---
  yaw_motors_reversed: _e(['OFF', 'ON'], 'OFF'),
  mixer_type: _e(['LEGACY', 'LINEAR', 'DYNAMIC', 'EZLANDING']),
  crashflip_motor_percent: _r(0, 100),
  crashflip_expo: _r(0, 100),

  // --- 3D mode ---
  '3d_deadband_low': _r(750, 1500),
  '3d_deadband_high': _r(1500, 2250),
  '3d_neutral': _r(750, 2250),
  '3d_deadband_throttle': _r(1, 100),
  '3d_limit_low': _r(750, 1500),
  '3d_limit_high': _r(1500, 2250),
  '3d_switched_mode': _e(['OFF', 'ON']),

  // --- Rate profile ---
  rateprofile_name: _s(1, 8, undefined, R),
  thr_mid: _r(0, 100, undefined, R),
  thr_expo: _r(0, 100, undefined, R),
  rates_type: _e(['BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK'], undefined, R),
  quickrates_rc_expo: _e(['OFF', 'ON'], undefined, R),
  roll_rc_rate: _r(1, 255, undefined, R),
  pitch_rc_rate: _r(1, 255, undefined, R),
  yaw_rc_rate: _r(1, 255, undefined, R),
  roll_expo: _r(0, 100, undefined, R),
  pitch_expo: _r(0, 100, undefined, R),
  yaw_expo: _r(0, 100, undefined, R),
  roll_srate: _r(0, 255, undefined, R),
  pitch_srate: _r(0, 255, undefined, R),
  yaw_srate: _r(0, 255, undefined, R),
  throttle_limit_type: _e(['OFF', 'SCALE', 'CLIP'], undefined, R),
  throttle_limit_percent: _r(25, 100, undefined, R),
  roll_rate_limit: _r(200, 1998, undefined, R),
  pitch_rate_limit: _r(200, 1998, undefined, R),
  yaw_rate_limit: _r(200, 1998, undefined, R),

  // --- System ---
  reboot_character: _r(48, 126),
  serial_update_rate_hz: _r(100, 2000),
  imu_dcm_kp: _r(0, 32000),
  imu_dcm_ki: _r(0, 32000),
  small_angle: _r(0, 180, 25),
  imu_process_denom: _r(1, 4),
  auto_disarm_delay: _r(0, 60),
  gyro_cal_on_first_arm: _e(['OFF', 'ON']),

  // --- GPS ---
  gps_provider: _e(['NMEA', 'UBLOX', 'MSP']),
  gps_sbas_mode: _e(['AUTO', 'EGNOS', 'WAAS', 'MSAS', 'GAGAN', 'NONE']),
  gps_auto_config: _e(['OFF', 'ON']),
  gps_auto_baud: _e(['OFF', 'ON']),
  gps_ublox_acquire_model: _e(['PORTABLE', 'STATIONARY', 'PEDESTRIAN', 'AUTOMOTIVE', 'AT_SEA', 'AIRBORNE_1G', 'AIRBORNE_2G', 'AIRBORNE_4G']),
  gps_ublox_flight_model: _e(['PORTABLE', 'STATIONARY', 'PEDESTRIAN', 'AUTOMOTIVE', 'AT_SEA', 'AIRBORNE_1G', 'AIRBORNE_2G', 'AIRBORNE_4G']),
  gps_update_rate_hz: _r(1, 20),
  gps_ublox_utc_standard: _e(['AUTO', 'USNO', 'EU', 'SU', 'NTSC']),
  gps_ublox_use_galileo: _e(['OFF', 'ON'], 'OFF'),
  gps_set_home_point_once: _e(['OFF', 'ON']),
  gps_use_3d_speed: _e(['OFF', 'ON']),
  gps_sbas_integrity: _e(['OFF', 'ON']),
  gps_nmea_custom_commands: _s(1, 64),

  // --- GPS Rescue ---
  gps_rescue_min_start_dist: _r(10, 30),
  gps_rescue_alt_mode: _e(['MAX_ALT', 'FIXED_ALT', 'CURRENT_ALT']),
  gps_rescue_initial_climb: _r(0, 100, 10),
  gps_rescue_ascend_rate: _r(50, 2500),
  gps_rescue_return_alt: _r(5, 1000),
  gps_rescue_ground_speed: _r(0, 3000),
  gps_rescue_max_angle: _r(30, 60),
  gps_rescue_roll_mix: _r(0, 250),
  gps_rescue_pitch_cutoff: _r(10, 255),
  gps_rescue_imu_yaw_gain: _r(5, 20),
  gps_rescue_descent_dist: _r(10, 500),
  gps_rescue_descend_rate: _r(25, 500),
  gps_rescue_landing_alt: _r(1, 15),
  gps_rescue_disarm_threshold: _r(1, 250),
  gps_rescue_throttle_min: _r(1000, 2000),
  gps_rescue_throttle_max: _r(1000, 2000),
  gps_rescue_throttle_hover: _r(1000, 2000),
  gps_rescue_sanity_checks: _e(['RESCUE_SANITY_OFF', 'RESCUE_SANITY_ON', 'RESCUE_SANITY_FS_ONLY']),
  gps_rescue_min_sats: _r(5, 50),
  gps_rescue_allow_arming_without_fix: _e(['OFF', 'ON'], 'OFF'),
  gps_rescue_throttle_p: _r(0, 255),
  gps_rescue_throttle_i: _r(0, 255),
  gps_rescue_throttle_d: _r(0, 255),
  gps_rescue_velocity_p: _r(0, 255),
  gps_rescue_velocity_i: _r(0, 255),
  gps_rescue_velocity_d: _r(0, 255),
  gps_rescue_yaw_p: _r(0, 255),

  // --- PID controller (global) ---
  deadband: _r(0, 32),
  yaw_deadband: _r(0, 100),
  yaw_control_reversed: _e(['OFF', 'ON']),
  pid_process_denom: _r(1, 16),
  runaway_takeoff_prevention: _e(['OFF', 'ON']),
  runaway_takeoff_deactivate_delay: _r(100, 1000),
  runaway_takeoff_deactivate_throttle_percent: _r(0, 100),

  // --- PID profile ---
  profile_name: _s(1, 8, undefined, P),

  // --- D-term filters (profile) ---
  dterm_lpf1_dyn_min_hz: _r(0, 1000, 75, P),
  dterm_lpf1_dyn_max_hz: _r(0, 1000, 150, P),
  dterm_lpf1_dyn_expo: _r(0, 10, undefined, P),
  dterm_lpf1_type: _e(['PT1', 'BIQUAD', 'PT2', 'PT3'], undefined, P),
  dterm_lpf1_static_hz: _r(0, 1000, 75, P),
  dterm_lpf2_type: _e(['PT1', 'BIQUAD', 'PT2', 'PT3'], undefined, P),
  dterm_lpf2_static_hz: _r(0, 1000, 150, P),
  dterm_notch_hz: _r(0, 1000, undefined, P),
  dterm_notch_cutoff: _r(0, 1000, undefined, P),

  // --- Voltage / throttle compensation (profile) ---
  vbat_sag_compensation: _r(0, 150, undefined, P),
  pid_at_min_throttle: _e(['OFF', 'ON'], undefined, P),

  // --- Anti-gravity (profile) ---
  anti_gravity_gain: _r(0, 250, 80, P),
  anti_gravity_cutoff_hz: _r(2, 50, undefined, P),
  anti_gravity_p_gain: _r(0, 250, undefined, P),

  // --- Acc / crash limits (profile) ---
  acc_limit_yaw: _r(0, 500, undefined, P),
  acc_limit: _r(0, 500, undefined, P),
  crash_dthreshold: _r(10, 2000, undefined, P),
  crash_gthreshold: _r(100, 2000, undefined, P),
  crash_setpoint_threshold: _r(50, 2000, undefined, P),
  crash_time: _r(100, 5000, undefined, P),
  crash_delay: _r(0, 500, undefined, P),
  crash_recovery_angle: _r(5, 30, undefined, P),
  crash_recovery_rate: _r(50, 255, undefined, P),
  crash_limit_yaw: _r(0, 1000, undefined, P),
  crash_recovery: _e(['OFF', 'ON', 'BEEP', 'DISARM'], undefined, P),

  // --- I-term (profile) ---
  iterm_rotation: _e(['OFF', 'ON'], undefined, P),
  iterm_relax: _e(['OFF', 'RP', 'RPY', 'RP_INC', 'RPY_INC'], undefined, P),
  iterm_relax_type: _e(['GYRO', 'SETPOINT'], undefined, P),
  iterm_relax_cutoff: _r(1, 50, 15, P),
  iterm_windup: _r(30, 100, undefined, P),
  iterm_limit: _r(0, 500, undefined, P),
  pidsum_limit: _r(100, 1000, 500, P),
  pidsum_limit_yaw: _r(100, 1000, 400, P),

  // --- Yaw lowpass (profile) ---
  yaw_lowpass_hz: _r(0, 500, 100, P),

  // --- Throttle boost (profile) ---
  throttle_boost: _r(0, 100, undefined, P),
  throttle_boost_cutoff: _r(5, 50, undefined, P),

  // --- Acro trainer (profile) ---
  acro_trainer_angle_limit: _r(10, 80, undefined, P),
  acro_trainer_lookahead_ms: _r(10, 200, undefined, P),
  acro_trainer_debug_axis: _e(['ROLL', 'PITCH'], undefined, P),
  acro_trainer_gain: _r(25, 255, undefined, P),

  // --- PID gains (profile) ---
  p_pitch: _r(0, 250, 47, P),
  i_pitch: _r(0, 250, 84, P),
  d_pitch: _r(0, 250, 46, P),
  f_pitch: _r(0, 1000, 125, P),
  p_roll: _r(0, 250, 45, P),
  i_roll: _r(0, 250, 80, P),
  d_roll: _r(0, 250, 40, P),
  f_roll: _r(0, 1000, 120, P),
  p_yaw: _r(0, 250, 45, P),
  i_yaw: _r(0, 250, 80, P),
  d_yaw: _r(0, 250, undefined, P),
  f_yaw: _r(0, 1000, 120, P),

  // --- Angle / Horizon mode (profile) ---
  angle_p_gain: _r(0, 200, undefined, P),
  angle_feedforward: _r(0, 200, undefined, P),
  angle_feedforward_smoothing_ms: _r(10, 250, undefined, P),
  angle_limit: _r(10, 85, undefined, P),
  angle_earth_ref: _r(0, 100, undefined, P),
  horizon_level_strength: _r(0, 100, undefined, P),
  horizon_limit_sticks: _r(10, 200, undefined, P),
  horizon_limit_degrees: _r(10, 250, undefined, P),
  horizon_ignore_sticks: _e(['OFF', 'ON'], undefined, P),
  horizon_delay_ms: _r(10, 5000, undefined, P),

  // --- Absolute control (profile) ---
  abs_control_gain: _r(0, 20, undefined, P),
  abs_control_limit: _r(10, 255, undefined, P),
  abs_control_error_limit: _r(1, 45, undefined, P),
  abs_control_cutoff: _r(1, 45, undefined, P),

  // --- Integrated yaw (profile) ---
  use_integrated_yaw: _e(['OFF', 'ON'], undefined, P),
  integrated_yaw_relax: _r(0, 255, undefined, P),

  // --- D-min / D-max (profile) ---
  d_min_roll: _r(0, 250, 30, P),
  d_min_pitch: _r(0, 250, 34, P),
  d_min_yaw: _r(0, 250, undefined, P),
  d_max_gain: _r(0, 100, undefined, P),
  d_max_advance: _r(0, 200, undefined, P),

  // --- Motor output (profile) ---
  motor_output_limit: _r(1, 100, undefined, P),
  auto_profile_cell_count: _r(-1, 8, undefined, P),

  // --- Launch control (profile) ---
  launch_control_mode: _e(['NORMAL', 'PITCHONLY', 'FULL'], undefined, P),
  launch_trigger_allow_reset: _e(['OFF', 'ON'], undefined, P),
  launch_trigger_throttle_percent: _r(0, 90, undefined, P),
  launch_angle_limit: _r(0, 80, undefined, P),
  launch_control_gain: _r(0, 200, undefined, P),

  // --- Thrust linear (profile) ---
  thrust_linear: _r(0, 150, 0, P),
  transient_throttle_limit: _r(0, 30, undefined, P),

  // --- Feedforward (profile) ---
  feedforward_transition: _r(0, 100, undefined, P),
  feedforward_averaging: _e(['OFF', '2_POINT', '3_POINT', '4_POINT'], undefined, P),
  feedforward_smooth_factor: _r(0, 95, undefined, P),
  feedforward_jitter_factor: _r(0, 20, undefined, P),
  feedforward_boost: _r(0, 50, undefined, P),
  feedforward_max_rate_limit: _r(0, 200, undefined, P),

  // --- Dynamic idle (profile) ---
  dyn_idle_min_rpm: _r(0, 200, 0, P),
  dyn_idle_p_gain: _r(1, 250, undefined, P),
  dyn_idle_i_gain: _r(1, 250, undefined, P),
  dyn_idle_d_gain: _r(0, 250, undefined, P),
  dyn_idle_max_increase: _r(10, 255, undefined, P),
  dyn_idle_start_increase: _r(10, 255, undefined, P),

  // --- Level race mode (profile) ---
  level_race_mode: _e(['OFF', 'ON'], undefined, P),

  // --- Simplified tuning (profile) ---
  simplified_pids_mode: _e(['OFF', 'RP', 'RPY'], undefined, P),
  simplified_master_multiplier: _r(0, 200, 100, P),
  simplified_i_gain: _r(0, 200, 100, P),
  simplified_d_gain: _r(0, 200, 100, P),
  simplified_pi_gain: _r(0, 200, 100, P),
  simplified_dmax_gain: _r(0, 200, 100, P),
  simplified_feedforward_gain: _r(0, 200, 100, P),
  simplified_pitch_d_gain: _r(0, 200, 100, P),
  simplified_pitch_pi_gain: _r(0, 200, undefined, P),
  simplified_dterm_filter: _e(['OFF', 'ON'], undefined, P),
  simplified_dterm_filter_multiplier: _r(10, 200, 100, P),

  // --- Simplified gyro filter (global) ---
  simplified_gyro_filter: _e(['OFF', 'ON']),
  simplified_gyro_filter_multiplier: _r(10, 200, 100),

  // --- TPA (profile) ---
  tpa_mode: _e(['PD', 'D'], undefined, P),
  tpa_rate: _r(0, 100, undefined, P),
  tpa_breakpoint: _r(1000, 2000, undefined, P),
  tpa_low_rate: _r(0, 100, undefined, P),
  tpa_low_breakpoint: _r(1000, 2000, undefined, P),
  tpa_low_always: _e(['OFF', 'ON'], undefined, P),

  // --- EZ Landing (profile) ---
  ez_landing_threshold: _r(0, 200, undefined, P),
  ez_landing_limit: _r(0, 75, 15, P),
  ez_landing_speed: _r(0, 250, undefined, P),

  // --- Telemetry ---
  tlm_inverted: _e(['OFF', 'ON']),
  tlm_halfduplex: _e(['OFF', 'ON']),
  hott_alarm_int: _r(0, 120),
  pid_in_tlm: _e(['OFF', 'ON']),
  report_cell_voltage: _e(['OFF', 'ON']),
  telemetry_disabled_voltage: _e(['OFF', 'ON']),
  telemetry_disabled_current: _e(['OFF', 'ON']),
  telemetry_disabled_fuel: _e(['OFF', 'ON']),
  telemetry_disabled_mode: _e(['OFF', 'ON']),
  telemetry_disabled_acc_x: _e(['OFF', 'ON']),
  telemetry_disabled_acc_y: _e(['OFF', 'ON']),
  telemetry_disabled_acc_z: _e(['OFF', 'ON']),
  telemetry_disabled_pitch: _e(['OFF', 'ON']),
  telemetry_disabled_roll: _e(['OFF', 'ON']),
  telemetry_disabled_heading: _e(['OFF', 'ON']),
  telemetry_disabled_altitude: _e(['OFF', 'ON']),
  telemetry_disabled_vario: _e(['OFF', 'ON']),
  telemetry_disabled_lat_long: _e(['OFF', 'ON']),
  telemetry_disabled_ground_speed: _e(['OFF', 'ON']),
  telemetry_disabled_distance: _e(['OFF', 'ON']),
  telemetry_disabled_esc_current: _e(['OFF', 'ON']),
  telemetry_disabled_esc_voltage: _e(['OFF', 'ON']),
  telemetry_disabled_esc_rpm: _e(['OFF', 'ON']),
  telemetry_disabled_esc_temperature: _e(['OFF', 'ON']),
  telemetry_disabled_temperature: _e(['OFF', 'ON']),
  telemetry_disabled_cap_used: _e(['OFF', 'ON']),

  // --- LED strip ---
  ledstrip_visual_beeper: _e(['OFF', 'ON']),
  ledstrip_visual_beeper_color: _e(['BLACK', 'WHITE', 'RED', 'ORANGE', 'YELLOW', 'LIME_GREEN', 'GREEN', 'MINT_GREEN', 'CYAN', 'LIGHT_BLUE', 'BLUE', 'DARK_VIOLET', 'MAGENTA', 'DEEP_PINK']),
  ledstrip_grb_rgb: _e(['GRB', 'RGB', 'GRBW']),
  ledstrip_profile: _e(['RACE', 'BEACON', 'STATUS']),
  ledstrip_race_color: _e(['BLACK', 'WHITE', 'RED', 'ORANGE', 'YELLOW', 'LIME_GREEN', 'GREEN', 'MINT_GREEN', 'CYAN', 'LIGHT_BLUE', 'BLUE', 'DARK_VIOLET', 'MAGENTA', 'DEEP_PINK']),
  ledstrip_beacon_color: _e(['BLACK', 'WHITE', 'RED', 'ORANGE', 'YELLOW', 'LIME_GREEN', 'GREEN', 'MINT_GREEN', 'CYAN', 'LIGHT_BLUE', 'BLUE', 'DARK_VIOLET', 'MAGENTA', 'DEEP_PINK']),
  ledstrip_beacon_period_ms: _r(50, 10000),
  ledstrip_beacon_percent: _r(0, 100),
  ledstrip_beacon_armed_only: _e(['OFF', 'ON']),
  ledstrip_brightness: _r(5, 100),
  ledstrip_rainbow_delta: _r(0, 359),
  ledstrip_rainbow_freq: _r(1, 2000),

  // --- SD card ---
  sdcard_detect_inverted: _e(['OFF', 'ON']),
  sdcard_mode: _e(['OFF', 'SPI', 'SDIO']),
  sdcard_spi_bus: _r(0, 4),
  sdio_clk_bypass: _e(['OFF', 'ON']),
  sdio_use_cache: _e(['OFF', 'ON']),
  sdio_use_4bit_width: _e(['OFF', 'ON']),

  // --- OSD ---
  osd_units: _e(['IMPERIAL', 'METRIC', 'BRITISH']),
  osd_warn_bitmask: _r(0, 4294967295),
  osd_rssi_alarm: _r(0, 100),
  osd_link_quality_alarm: _r(0, 100),
  osd_rssi_dbm_alarm: _r(-130, 0),
  osd_rsnr_alarm: _r(-30, 20),
  osd_cap_alarm: _r(0, 20000),
  osd_alt_alarm: _r(0, 10000),
  osd_distance_alarm: _r(0, 65535),
  osd_esc_temp_alarm: _r(0, 255),
  osd_esc_rpm_alarm: _r(-1, 32767),
  osd_esc_current_alarm: _r(-1, 32767),
  osd_core_temp_alarm: _r(0, 255),
  osd_ah_max_pit: _r(0, 90),
  osd_ah_max_rol: _r(0, 90),
  osd_ah_invert: _e(['OFF', 'ON']),
  osd_logo_on_arming: _e(['OFF', 'ON', 'FIRST_ARMING']),
  osd_logo_on_arming_duration: _r(5, 50),
  osd_tim1: _r(0, 32767),
  osd_tim2: _r(0, 32767),

  // --- OSD element positions ---
  osd_vbat_pos: _r(0, 65535, 341),
  osd_rssi_pos: _r(0, 65535),
  osd_link_quality_pos: _r(0, 65535, 341),
  osd_link_tx_power_pos: _r(0, 65535),
  osd_rssi_dbm_pos: _r(0, 65535),
  osd_rsnr_pos: _r(0, 65535),
  osd_tim_1_pos: _r(0, 65535, 341),
  osd_tim_2_pos: _r(0, 65535),
  osd_remaining_time_estimate_pos: _r(0, 65535),
  osd_flymode_pos: _r(0, 65535),
  osd_anti_gravity_pos: _r(0, 65535),
  osd_g_force_pos: _r(0, 65535),
  osd_throttle_pos: _r(0, 65535, 341),
  osd_vtx_channel_pos: _r(0, 65535),
  osd_crosshairs_pos: _r(0, 65535),
  osd_ah_sbar_pos: _r(0, 65535),
  osd_ah_pos: _r(0, 65535),
  osd_current_pos: _r(0, 65535),
  osd_mah_drawn_pos: _r(0, 65535),
  osd_wh_drawn_pos: _r(0, 65535),
  osd_motor_diag_pos: _r(0, 65535),
  osd_craft_name_pos: _r(0, 65535),
  osd_pilot_name_pos: _r(0, 65535),
  osd_gps_speed_pos: _r(0, 65535, 341),
  osd_gps_lon_pos: _r(0, 65535),
  osd_gps_lat_pos: _r(0, 65535),
  osd_gps_sats_pos: _r(0, 65535, 341),
  osd_home_dir_pos: _r(0, 65535, 341),
  osd_home_dist_pos: _r(0, 65535),
  osd_flight_dist_pos: _r(0, 65535),
  osd_compass_bar_pos: _r(0, 65535),
  osd_altitude_pos: _r(0, 65535),
  osd_pid_roll_pos: _r(0, 65535),
  osd_pid_pitch_pos: _r(0, 65535),
  osd_pid_yaw_pos: _r(0, 65535),
  osd_debug_pos: _r(0, 65535),
  osd_power_pos: _r(0, 65535),
  osd_pidrate_profile_pos: _r(0, 65535),
  osd_warnings_pos: _r(0, 65535, 14772),
  osd_avg_cell_voltage_pos: _r(0, 65535, 341),
  osd_pit_ang_pos: _r(0, 65535),
  osd_rol_ang_pos: _r(0, 65535),
  osd_battery_usage_pos: _r(0, 65535),
  osd_disarmed_pos: _r(0, 65535),
  osd_nheading_pos: _r(0, 65535),
  osd_up_down_reference_pos: _r(0, 65535),
  osd_ready_mode_pos: _r(0, 65535),
  osd_nvario_pos: _r(0, 65535),
  osd_esc_tmp_pos: _r(0, 65535),
  osd_esc_rpm_pos: _r(0, 65535),
  osd_esc_rpm_freq_pos: _r(0, 65535),
  osd_rtc_date_time_pos: _r(0, 65535),
  osd_adjustment_range_pos: _r(0, 65535),
  osd_flip_arrow_pos: _r(0, 65535),
  osd_core_temp_pos: _r(0, 65535),
  osd_log_status_pos: _r(0, 65535),
  osd_stick_overlay_left_pos: _r(0, 65535),
  osd_stick_overlay_right_pos: _r(0, 65535),
  osd_stick_overlay_radio_mode: _r(1, 4),
  osd_rate_profile_name_pos: _r(0, 65535),
  osd_pid_profile_name_pos: _r(0, 65535),
  osd_profile_name_pos: _r(0, 65535),
  osd_rcchannels_pos: _r(0, 65535),
  osd_camera_frame_pos: _r(0, 65535),
  osd_efficiency_pos: _r(0, 65535),
  osd_total_flights_pos: _r(0, 65535),
  osd_aux_pos: _r(0, 65535),
  osd_sys_goggle_voltage_pos: _r(0, 65535),
  osd_sys_vtx_voltage_pos: _r(0, 65535),
  osd_sys_bitrate_pos: _r(0, 65535),
  osd_sys_delay_pos: _r(0, 65535),
  osd_sys_distance_pos: _r(0, 65535),
  osd_sys_lq_pos: _r(0, 65535),
  osd_sys_goggle_dvr_pos: _r(0, 65535),
  osd_sys_vtx_dvr_pos: _r(0, 65535),
  osd_sys_warnings_pos: _r(0, 65535),
  osd_sys_vtx_temp_pos: _r(0, 65535),
  osd_sys_fan_speed_pos: _r(0, 65535),

  // --- OSD settings ---
  osd_stat_bitmask: _r(0, 4294967295, 14124),
  osd_profile: _r(1, 3),
  osd_profile_1_name: _s(1, 16),
  osd_profile_2_name: _s(1, 16),
  osd_profile_3_name: _s(1, 16),
  osd_gps_sats_show_pdop: _e(['OFF', 'ON']),
  osd_displayport_device: _e(['NONE', 'AUTO', 'MAX7456', 'MSP', 'FRSKYOSD']),
  osd_rcchannels: _a(4),
  osd_camera_frame_width: _r(2, 30),
  osd_camera_frame_height: _r(2, 16),
  osd_stat_avg_cell_value: _e(['OFF', 'ON']),
  osd_framerate_hz: _r(1, 60),
  osd_menu_background: _e(['TRANSPARENT', 'BLACK', 'GRAY', 'LIGHT_GRAY']),
  osd_aux_channel: _r(1, 18),
  osd_aux_scale: _r(1, 1000),
  osd_aux_symbol: _r(0, 255),
  osd_canvas_width: _r(0, 63),
  osd_canvas_height: _r(0, 31),
  osd_craftname_msgs: _e(['OFF', 'ON']),

  // --- Debug ---
  task_statistics: _e(['OFF', 'ON']),
  debug_mode: _e(['NONE', 'CYCLETIME', 'BATTERY', 'GYRO_FILTERED', 'ACCELEROMETER', 'PIDLOOP', 'GYRO_SCALED', 'RC_INTERPOLATION', 'ANGLERATE', 'ESC_SENSOR', 'SCHEDULER', 'STACK', 'ESC_SENSOR_RPM', 'ESC_SENSOR_TMP', 'ALTITUDE', 'FFT', 'FFT_TIME', 'FFT_FREQ', 'RX_FRSKY_SPI', 'RX_SFHSS_SPI', 'GYRO_RAW', 'DUAL_GYRO_RAW', 'DUAL_GYRO_DIFF', 'MAX7456_SIGNAL', 'MAX7456_SPICLOCK', 'SBUS', 'FPORT', 'RANGEFINDER', 'RANGEFINDER_QUALITY', 'LIDAR_TF', 'ADC_INTERNAL', 'RUNAWAY_TAKEOFF', 'SDIO', 'CURRENT_SENSOR', 'USB', 'SMARTAUDIO', 'RTH', 'ITERM_RELAX', 'ACRO_TRAINER', 'RC_SMOOTHING', 'RX_SIGNAL_LOSS', 'RC_SMOOTHING_RATE', 'ANTI_GRAVITY', 'DYN_LPF', 'RX_SPEKTRUM_SPI', 'DSHOT_RPM_TELEMETRY', 'RPM_FILTER', 'D_MIN', 'AC_CORRECTION', 'AC_ERROR', 'DUAL_GYRO_SCALED', 'DSHOT_RPM_ERRORS', 'CRSF_LINK_STATISTICS_UPLINK', 'CRSF_LINK_STATISTICS_PWR', 'CRSF_LINK_STATISTICS_DOWN', 'BARO', 'GPS_RESCUE_THROTTLE_PID', 'DYN_IDLE', 'FEEDFORWARD_LIMIT', 'FEEDFORWARD', 'BLACKBOX_OUTPUT', 'GYRO_SAMPLE', 'RX_TIMING', 'D_LPF', 'VTX_TRAMP', 'GHST', 'GHST_MSP', 'SCHEDULER_DETERMINISM', 'TIMING_ACCURACY', 'RX_EXPRESSLRS_SPI', 'RX_EXPRESSLRS_PHASELOCK', 'RX_STATE_TIME', 'GPS_RESCUE_VELOCITY', 'GPS_RESCUE_HEADING', 'GPS_RESCUE_TRACKING', 'GPS_CONNECTION', 'ATTITUDE', 'VTX_MSP', 'GPS_DOP', 'FAILSAFE', 'GYRO_CALIBRATION', 'ANGLE_MODE', 'ANGLE_TARGET', 'CURRENT_ANGLE', 'DSHOT_TELEMETRY_COUNTS', 'RPM_LIMIT', 'RC_STATS', 'MAG_CALIB', 'MAG_TASK_RATE', 'EZLANDING']),

  // --- System config ---
  rate_6pos_switch: _e(['OFF', 'ON']),
  cpu_overclock: _e(['OFF', '240MHZ']),
  pwr_on_arm_grace: _r(0, 30),
  enable_stick_arming: _e(['OFF', 'ON']),

  // --- VTX ---
  vtx_band: _r(0, 8),
  vtx_channel: _r(0, 8),
  vtx_power: _r(0, 7),
  vtx_low_power_disarm: _e(['OFF', 'ON', 'UNTIL_FIRST_ARM']),
  vtx_softserial_alt: _e(['OFF', 'ON']),
  vtx_freq: _r(0, 5999),
  vtx_pit_mode_freq: _r(0, 5999),
  vtx_halfduplex: _e(['OFF', 'ON']),

  // --- Video ---
  vcd_video_system: _e(['AUTO', 'PAL', 'NTSC', 'HD']),
  vcd_h_offset: _r(-32, 31),
  vcd_v_offset: _r(-15, 16),
  max7456_clock: _e(['HALF', 'NOMINAL', 'DOUBLE']),
  max7456_spi_bus: _r(0, 4),
  max7456_preinit_opu: _e(['OFF', 'ON']),

  // --- Display port ---
  displayport_msp_col_adjust: _r(-6, 0),
  displayport_msp_row_adjust: _r(-3, 0),
  displayport_msp_fonts: _a(4),
  displayport_msp_use_device_blink: _e(['OFF', 'ON']),
  displayport_max7456_col_adjust: _r(-6, 0),
  displayport_max7456_row_adjust: _r(-3, 0),
  displayport_max7456_inv: _e(['OFF', 'ON']),
  displayport_max7456_blk: _r(0, 3),
  displayport_max7456_wht: _r(0, 3),

  // --- ESC sensor ---
  esc_sensor_halfduplex: _e(['OFF', 'ON']),
  esc_sensor_current_offset: _r(0, 16000),

  // --- LED / Camera ---
  led_inversion: _r(0, 7),
  camera_control_mode: _e(['HARDWARE_PWM', 'SOFTWARE_PWM', 'DAC']),
  camera_control_ref_voltage: _r(200, 400),
  camera_control_key_delay: _r(100, 500),
  camera_control_internal_resistance: _r(10, 1000),
  camera_control_button_resistance: _a(5),
  camera_control_inverted: _e(['OFF', 'ON']),

  // --- Pinio ---
  pinio_config: _a(4),
  pinio_box: _a(4),

  // --- USB ---
  usb_hid_cdc: _e(['OFF', 'ON']),
  usb_msc_pin_pullup: _e(['OFF', 'ON']),

  // --- RC device ---
  rcdevice_init_dev_attempts: _r(0, 10),
  rcdevice_init_dev_attempt_interval: _r(0, 5000),
  rcdevice_protocol_version: _r(0, 1),
  rcdevice_feature: _r(0, 65535),

  // --- Gyro hardware ---
  gyro_1_bustype: _e(['NONE', 'I2C', 'SPI', 'SLAVE']),
  gyro_1_spibus: _r(0, 4),
  gyro_1_i2cBus: _r(0, 4),
  gyro_1_i2c_address: _r(0, 119),
  gyro_1_sensor_align: _e(['DEFAULT', 'CW0', 'CW90', 'CW180', 'CW270', 'CW0FLIP', 'CW90FLIP', 'CW180FLIP', 'CW270FLIP', 'CUSTOM']),
  gyro_1_align_roll: _r(-3600, 3600),
  gyro_1_align_pitch: _r(-3600, 3600),
  gyro_1_align_yaw: _r(-3600, 3600),
  gyro_2_bustype: _e(['NONE', 'I2C', 'SPI', 'SLAVE']),
  gyro_2_spibus: _r(0, 4),
  gyro_2_i2cBus: _r(0, 4),
  gyro_2_i2c_address: _r(0, 119),
  gyro_2_sensor_align: _e(['DEFAULT', 'CW0', 'CW90', 'CW180', 'CW270', 'CW0FLIP', 'CW90FLIP', 'CW180FLIP', 'CW270FLIP', 'CUSTOM']),
  gyro_2_align_roll: _r(-3600, 3600),
  gyro_2_align_pitch: _r(-3600, 3600),
  gyro_2_align_yaw: _r(-3600, 3600),

  // --- I2C ---
  i2c1_pullup: _e(['OFF', 'ON']),
  i2c1_clockspeed_khz: _r(100, 1300),
  i2c2_pullup: _e(['OFF', 'ON']),
  i2c2_clockspeed_khz: _r(100, 1300),
  i2c3_pullup: _e(['OFF', 'ON']),
  i2c3_clockspeed_khz: _r(100, 1300),

  // --- Scheduler ---
  mco2_on_pc9: _e(['OFF', 'ON']),
  scheduler_relax_rx: _r(0, 500),
  scheduler_relax_osd: _r(0, 500),
  cpu_late_limit_permille: _r(0, 100),
  serialmsp_halfduplex: _e(['OFF', 'ON']),
  timezone_offset_minutes: _r(-780, 780),

  // --- RPM filter ---
  rpm_filter_harmonics: _r(0, 3),
  rpm_filter_weights: _a(3),
  rpm_filter_q: _r(250, 3000),
  rpm_filter_min_hz: _r(30, 200),
  rpm_filter_fade_range_hz: _r(0, 1000),
  rpm_filter_lpf_hz: _r(100, 500),

  // --- Stats ---
  stats_min_armed_time_s: _r(-1, 127),
  stats_total_flights: _r(0, 4294967295),
  stats_total_time_s: _r(0, 4294967295),
  stats_total_dist_m: _r(0, 4294967295),

  // --- Craft ---
  craft_name: _s(1, 16, '-'),
  pilot_name: _s(1, 16),

  // --- Altitude ---
  altitude_source: _e(['DEFAULT', 'BARO_ONLY', 'GPS_ONLY']),
  altitude_prefer_baro: _r(0, 100),
  altitude_lpf: _r(10, 1000),
  altitude_d_lpf: _r(10, 1000),

  // --- Box user ---
  box_user_1_name: _s(1, 16),
  box_user_2_name: _s(1, 16),
  box_user_3_name: _s(1, 16),
  box_user_4_name: _s(1, 16),
}
