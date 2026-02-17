# Betaflight Tuning Helper

Client-side Blackbox log analyzer. No backend — everything runs in-browser.

## Commands

```bash
npm run dev        # Dev server at localhost:5173
npm run build      # tsc && vite build → dist/
npm run preview    # Preview production build
npm run lint       # ESLint
```

No test framework is set up yet.

## Architecture

- **Domain layer** (`src/domain/`) — Pure logic, no React/MobX imports
  - `engine/RuleEngine.ts` — Segments log into windows, runs rules, deduplicates issues and recommendations
  - `rules/` — 8 self-contained `TuningRule` objects (BouncebackRule, PropwashRule, WobbleRule, TrackingQualityRule, MotorSaturationRule, DTermNoiseRule, GyroNoiseRule, HighThrottleOscillationRule)
  - `types/` — `LogFrame`, `Analysis` (DetectedIssue, Recommendation, ParameterChange), `TuningRule` interface
  - `utils/` — FFT (Cooley-Tukey), signal analysis algorithms
- **Stores** (`src/stores/`) — MobX with decorators (`experimentalDecorators: true`)
  - `LogStore` — Parsed frames, metadata, worker communication
  - `AnalysisStore` — Analysis results, issue/recommendation selection
  - `UIStore` — Axis selection, zoom, chart toggles
  - `RootStore` — Composes all stores, provides React context
- **Components** (`src/components/`) — React 18 with `observer()` from mobx-react-lite
- **Workers** (`src/workers/logParser.worker.ts`) — Parses .bbl (via `blackbox-log` WASM), .txt/.csv in background thread

## Key Patterns

- Rules are plain objects conforming to `TuningRule` interface — registered in `RuleEngine` constructor
- Issue dedup: temporal merge (100ms gap) then collapse by type+axis into single entry with count
- Recommendation dedup: keyed on `parameter:axis` from `changes[]`, not title string
- Chart downsamples to max 2000 points
- All Betaflight parameter names defined in `BetaflightParameter` union type in `Analysis.ts`

## Conventions

- TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters`
- No `any` in domain layer (warning-level in eslint)
- Tailwind CSS for styling
- MobX `@observable`, `@computed`, `@action`, `runInAction` patterns
- Web Worker uses `postMessage` for progress updates

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. Pushes to `main` trigger build + deploy. Vite `base` is set dynamically from `GITHUB_REPOSITORY` env var.
