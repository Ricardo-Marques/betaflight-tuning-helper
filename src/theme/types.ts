export interface ThemeColors {
  background: {
    app: string
    panel: string
    section: string
    header: string
    footer: string
    input: string
    hover: string
    selected: string
    cliPreview: string
  }
  text: {
    primary: string
    secondary: string
    muted: string
    inverse: string
    link: string
    linkHover: string
    heading: string
    headerSubtle: string
  }
  border: {
    main: string
    subtle: string
    focus: string
  }
  severity: {
    high: string
    highBg: string
    highText: string
    medium: string
    mediumBg: string
    mediumText: string
    low: string
    lowBg: string
    lowText: string
  }
  chart: {
    gyro: string
    setpoint: string
    pidD: string
    motor1: string
    motor2: string
    motor3: string
    motor4: string
    grid: string
    axis: string
    tooltipBg: string
    tooltipBorder: string
  }
  button: {
    primary: string
    primaryHover: string
    primaryText: string
    secondary: string
    secondaryHover: string
    secondaryText: string
  }
  health: {
    excellentBg: string
    excellentText: string
    goodBg: string
    goodText: string
    needsWorkBg: string
    needsWorkText: string
    criticalBg: string
    criticalText: string
  }
  accent: {
    indigo: string
    indigoBg: string
    indigoText: string
    green: string
    greenBg: string
    greenText: string
    orange: string
    orangeText: string
  }
  scrollbar: {
    track: string
    thumb: string
    thumbHover: string
  }
  change: {
    increase: string
    decrease: string
    neutral: string
  }
}

export interface Theme {
  colors: ThemeColors
}
