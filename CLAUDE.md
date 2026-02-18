# Betaflight Tuning Helper

Client-side Blackbox log analyzer. No backend — everything runs in-browser.

## Commands

```bash
pnpm dev           # Dev server at localhost:5173
pnpm build         # tsc && vite build → dist/
pnpm preview       # Preview production build
pnpm lint          # ESLint
```

E2E tests use Playwright (`pnpm test`). Aim for the full suite to run in ~10 minutes or less.

## Architecture

- **Domain layer** (`src/domain/`) — Pure logic, no React/MobX imports
  - `engine/RuleEngine.ts` — Segments log into windows, runs rules, deduplicates issues and recommendations
  - `rules/` — 8 self-contained `TuningRule` objects (BouncebackRule, PropwashRule, WobbleRule, TrackingQualityRule, MotorSaturationRule, DTermNoiseRule, GyroNoiseRule, HighThrottleOscillationRule)
  - `types/` — `LogFrame`, `Analysis` (DetectedIssue, Recommendation, ParameterChange), `TuningRule` interface
  - `utils/` — FFT (Cooley-Tukey), signal analysis algorithms
- **Stores** (`src/stores/`) — MobX with `makeAutoObservable`
  - `LogStore` — Parsed frames, metadata, worker communication
  - `AnalysisStore` — Analysis results, issue/recommendation selection
  - `UIStore` — Axis selection, zoom, chart toggles
  - `RootStore` — Composes all stores, provides React context
- **Components** (`src/components/`) — React 18 with `observer()` from mobx-react-lite
- **BBL Parser** (`src/domain/blackbox/`) — Pure TypeScript binary parser for .bbl/.bfl files (version-agnostic, no WASM)
- **Workers** (`src/workers/logParser.worker.ts`) — Parses .bbl/.bfl (native TS parser) and .txt/.csv in background thread
- **MobX Reactive Primitives** (`src/lib/mobx-reactivity/`) — `useObservableState`, `useComputed`, `useAutorun`

## Key Patterns

- Rules are plain objects conforming to `TuningRule` interface — registered in `RuleEngine` constructor
- Issue dedup: temporal merge (100ms gap) then collapse by type+axis into single entry with count
- Recommendation dedup: keyed on `parameter:axis` from `changes[]`, not title string
- Chart downsamples to max 2000 points
- All Betaflight parameter names defined in `BetaflightParameter` union type in `Analysis.ts`

## Conventions

- TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters`
- No `any` in domain layer (warning-level in eslint)
- Emotion styled components for styling (no Tailwind, no inline styles)
- MobX `makeAutoObservable`, `runInAction` patterns
- MobX reactive primitives (`useObservableState`, `useComputed`, `useAutorun`) instead of React hooks
- Web Worker uses `postMessage` for progress updates

## Commit Workflow

- **Plain language commit messages** — write for non-technical users, not developers
  - Good: "Show build time in user's timezone on What's New modal"
  - Bad: "Emit full ISO datetime from changelogPlugin and add formatBuildDate using toLocaleTimeString"
- **One concern per commit** — split unrelated changes into separate commits
- **After committing**: if the change is user-facing, add an entry to `src/data/changelog.ts`
- **NEVER use `force: true` or `evaluate` workarounds** — fix the actual component instead
- **Don't re-run all tests** unless there's a strong reason they might fail; run targeted tests instead

## Useful Scripts

- Screenshot automation: `npx tsx scripts/take-screenshots.ts` (pass a number for individual shots, e.g. `2`)

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`. Pushes to `main` trigger build + deploy. Vite `base` is set dynamically from `GITHUB_REPOSITORY` env var.
