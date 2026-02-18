<p align="center">
  <img src="public/logo.svg" width="100" alt="Betaflight Tuning Helper logo" />
</p>

<h1 align="center">Betaflight Tuning Helper</h1>

<p align="center">
  <strong>Drop a Blackbox log, get specific tuning recommendations.</strong><br/>
  <a href="https://ricardo-marques.github.io/betaflight-tuning-helper/">Try it live</a>
</p>

Client-side web app that analyzes Betaflight Blackbox logs and generates actionable tuning recommendations. No backend — everything runs in your browser.

## Why This Exists

PID tuning is one of the hardest parts of FPV. Most pilots either fly stock settings or spend hours in trial-and-error, changing one slider at a time and hoping for the best.

Blackbox logs contain all the data needed to diagnose problems — oscillations, propwash, bounceback, noise — but interpreting raw gyro/motor traces is expert-level knowledge. Existing tools like Blackbox Explorer show you the data, but don't tell you _what to change_.

This app bridges that gap. Drop a log file, and it will:

- **Detect specific issues** (propwash, bounceback, noise, tracking errors, motor saturation, etc.)
- **Recommend parameter changes** with rationale, risk assessment, and confidence scores
- **Speak Betaflight** — all output uses 4.4/4.5 slider terminology, ready to apply in the Configurator

Everything runs 100% client-side. No data leaves your browser, no account required.

## Features

**Log parsing** — Upload `.bbl` files directly from your flight controller, or `.txt`/`.csv` exports from Blackbox Explorer. Binary BBL parsing uses a native TypeScript parser (version-agnostic, no WASM dependency). Parsed in a Web Worker so the UI stays responsive. Handles 10MB+ logs.

**8 detection rules** — The rule engine analyzes overlapping time windows across roll, pitch, and yaw:

| Rule                      | Detects                                       | Key recommendations           |
| ------------------------- | --------------------------------------------- | ----------------------------- |
| Bounceback                | Overshoot after stick release                 | Adjust D / D_min              |
| Propwash                  | Oscillations during throttle drops            | Increase D_min, dynamic idle  |
| Wobble                    | Mid-throttle oscillations without stick input | Increase P / FF or filtering  |
| Tracking Quality          | Setpoint-to-gyro tracking error               | Adjust P, I, or FF            |
| Motor Saturation          | Motors clipping at 100%                       | Reduce master multiplier or P |
| D-term Noise              | Excessive D-term activity                     | Increase D-term filtering     |
| Gyro Noise                | High gyro noise floor                         | Increase gyro filtering       |
| High-Throttle Oscillation | Oscillations at high throttle (TPA)           | Adjust TPA rate/breakpoint    |

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

1. Drag and drop a `.bbl` file from your flight controller (or a `.txt`/`.csv` export from Blackbox Explorer)
2. Click **Analyze Log**
3. Review detected issues and recommendations
4. Apply changes in Betaflight Configurator

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

- Multi-log BBL files: only the first log is parsed (most common case)
- Files > 50MB may slow the browser
- Simplified FFT (sufficient for tuning, not research-grade)

## License

MIT
