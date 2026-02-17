# Betaflight Tuning Helper

**[Try it live](https://ricardo-marques.github.io/betaflight-tuning-helper/)**

Client-side web app that analyzes Betaflight Blackbox logs and generates actionable tuning recommendations. No backend — everything runs in your browser.

## Features

**Log parsing** — Upload `.txt` or `.csv` files exported from Blackbox Explorer. Parsed in a Web Worker so the UI stays responsive. Handles 10MB+ logs.

**8 detection rules** — The rule engine analyzes overlapping time windows across roll, pitch, and yaw:

| Rule | Detects | Key recommendations |
|------|---------|-------------------|
| Bounceback | Overshoot after stick release | Adjust D / D_min |
| Propwash | Oscillations during throttle drops | Increase D_min, dynamic idle |
| Wobble | Mid-throttle oscillations without stick input | Increase P / FF or filtering |
| Tracking Quality | Setpoint-to-gyro tracking error | Adjust P, I, or FF |
| Motor Saturation | Motors clipping at 100% | Reduce master multiplier or P |
| D-term Noise | Excessive D-term activity | Increase D-term filtering |
| Gyro Noise | High gyro noise floor | Increase gyro filtering |
| High-Throttle Oscillation | Oscillations at high throttle (TPA) | Adjust TPA rate/breakpoint |

**Smart deduplication** — Issues are collapsed per type+axis (one entry regardless of how many windows detected it). Recommendations are deduplicated by parameter+axis so you never see two items targeting the same slider.

**Interactive chart** — Gyro, setpoint, PID terms, and motor outputs with per-axis selection, layer toggles, and zoom. Downsampled to 2000 points for smooth rendering.

**Betaflight-native output** — All recommendations use Betaflight 4.4/4.5 slider terminology with specific parameter changes, rationale, risk assessment, and confidence scores.

## Tech Stack

React 18, TypeScript (strict), MobX, Vite, Recharts, Tailwind CSS, Web Workers

## Getting Started

```bash
npm install
npm run dev        # http://localhost:5173
```

### Usage

1. Export a blackbox log as `.txt` from Blackbox Explorer
2. Drag and drop the file into the app
3. Click **Analyze Log**
4. Review detected issues and recommendations
5. Apply changes in Betaflight Configurator

### Build

```bash
npm run build      # Output in dist/
npm run preview    # Preview production build locally
```

## Deployment

The app deploys automatically to GitHub Pages on every push to `main` via the workflow in `.github/workflows/deploy.yml`.

To set up GitHub Pages for your fork:

1. Push the repo to GitHub
2. Go to **Settings > Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` — the workflow will build and deploy automatically

The Vite config reads the repo name from the `GITHUB_REPOSITORY` environment variable at build time, so no hardcoded base path is needed.

## Project Structure

```
src/
  domain/
    engine/RuleEngine.ts        # Orchestrates analysis: windowing, dedup, recommendations
    rules/                      # 8 self-contained detection rules
    types/                      # LogFrame, Analysis, TuningRule interfaces
    utils/                      # FFT, signal analysis algorithms
  stores/                       # MobX stores (LogStore, AnalysisStore, UIStore)
  components/                   # React components (FileUpload, LogChart, etc.)
  workers/logParser.worker.ts   # Background log parser
```

## Adding a New Rule

Create a `TuningRule` object in `src/domain/rules/` and register it in the `RuleEngine` constructor:

```typescript
export const MyRule: TuningRule = {
  id: 'my-rule',
  name: 'My Detection',
  description: '...',
  issueTypes: ['myIssueType'],
  baseConfidence: 0.85,
  applicableAxes: ['roll', 'pitch'],
  condition: (window, frames) => window.metadata.hasStickInput,
  detect: (window, frames) => [],
  recommend: (issues, frames) => [],
}
```

## Known Limitations

- Binary `.bbl` files not supported — export as `.txt` from Blackbox Explorer
- Files > 50MB may slow the browser
- Simplified FFT (sufficient for tuning, not research-grade)
- Cannot extract current PID values from the log itself

## License

MIT
