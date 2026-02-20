# Codebase Skill — Complete Operational Guide

> **KEEP THIS FILE UP TO DATE.** When architectural decisions change, files move, new patterns are adopted, or conventions shift, update this file immediately. Stale guidance is worse than no guidance. After any structural change (new store, renamed file, new dependency, changed workflow), check if this file needs updating.

---

## Quick Reference Commands

```bash
pnpm dev              # Dev server → localhost:5173
pnpm build            # tsc && vite build → dist/
pnpm lint             # ESLint (--max-warnings 0, zero tolerance)
pnpm test             # Playwright E2E (full suite, ~10 min)
pnpm test:headed      # E2E with visible browser
pnpm test:ui          # E2E Playwright UI debug mode
pnpm test:unit        # Vitest unit tests (src/**/*.test.ts)
npx tsx scripts/take-screenshots.ts      # All 8 showcase screenshots
npx tsx scripts/take-screenshots.ts 2    # Single screenshot by index
npx tsx scripts/take-screenshots.ts composite  # Re-composite from existing raws
```

---

## File Map — Where to Find Everything

### By Purpose

| I need to...                          | Look here                                           |
|---------------------------------------|-----------------------------------------------------|
| Add/change a React component          | `src/components/`                                   |
| Add/change chart logic                | `src/components/LogChart.tsx` + `src/components/logChart/` |
| Add/change chart styles               | `src/components/LogChart.styles.ts`                 |
| Add a new tuning rule                 | `src/domain/rules/` (create new file, register in RuleEngine) |
| Change how analysis works             | `src/domain/engine/RuleEngine.ts`                   |
| Add/change a Betaflight parameter     | `src/domain/types/Analysis.ts` (BetaflightParameter type) |
| Map parameter to CLI command          | `src/domain/utils/CliExport.ts`                     |
| Add CLI option metadata/ranges        | `src/lib/betaflight/cliOptions.ts`                  |
| Change how .bbl/.bfl files parse      | `src/domain/blackbox/`                              |
| Change how .txt/.csv files parse      | `src/workers/logParser.worker.ts`                   |
| Add/change a MobX store               | `src/stores/`                                       |
| Wire a new store into the app         | `src/stores/RootStore.ts`                           |
| Add/change theme colors               | `src/theme/lightTheme.ts`, `src/theme/darkTheme.ts` |
| Add/change theme type                 | `src/theme/types.ts` (ThemeColors interface)         |
| Add global CSS animations             | `src/theme/GlobalStyles.tsx`                        |
| Add/change MobX reactive primitives   | `src/lib/mobx-reactivity/`                          |
| Add/change serial (USB) communication | `src/serial/`                                       |
| Add/change quad profile thresholds    | `src/domain/profiles/quadProfiles.ts`               |
| Add/change issue descriptions on chart| `src/domain/utils/issueChartDescriptions.ts`        |
| Update changelog                      | `src/data/changelog.ts`                             |
| Change build/deploy                   | `vite.config.ts`, `.github/workflows/deploy.yml`    |
| Change virtual:changelog module       | `vite-plugins/changelogPlugin.ts`                   |
| Add/change E2E tests                  | `e2e/` (specs + helpers)                            |
| Add/change unit tests                 | Co-located with source: `src/**/*.test.ts`          |
| Change Playwright config              | `playwright.config.ts`                              |
| Change ESLint rules                   | `eslint.config.js`                                  |
| Check TS config                       | `tsconfig.json` (`useDefineForClassFields: false`)  |

### Key Files (Sorted by Importance)

| File | Lines | Role |
|------|-------|------|
| `src/App.tsx` | ~613 | Root layout, panel resize, drag-drop, modal orchestration |
| `src/stores/RootStore.ts` | ~96 | Composes all stores, provides React context + hooks |
| `src/stores/AnalysisStore.ts` | ~200 | Analysis results, issue/recommendation selection, reanalyze |
| `src/stores/LogStore.ts` | ~130 | Parsed frames, metadata, worker communication |
| `src/stores/UIStore.ts` | ~294 | Axis, zoom, panel state, modals, mobile layout, toasts |
| `src/stores/SettingsStore.ts` | ~200 | Imported Betaflight settings, pending/accepted values |
| `src/stores/SerialStore.ts` | ~200 | USB serial connection, read/write to FC |
| `src/stores/FlashDownloadStore.ts` | ~160 | Download logs from FC flash memory |
| `src/domain/engine/RuleEngine.ts` | ~500 | Orchestrates analysis: segment → detect → dedup → recommend |
| `src/domain/types/Analysis.ts` | ~245 | DetectedIssue, Recommendation, ParameterChange, BetaflightParameter |
| `src/domain/types/LogFrame.ts` | ~167 | LogFrame, LogMetadata, AxisData interfaces |
| `src/domain/types/TuningRule.ts` | ~60 | TuningRule interface (condition, detect, recommend) |
| `src/components/RecommendationsPanel.tsx` | ~1429 | Tuning recommendations UI (tabs, CLI export, accept tune) |
| `src/components/LogChart.tsx` | ~385 | Recharts line chart with issue markers |
| `src/components/logChart/useChartData.ts` | ~100 | Downsample frames → chart data points |
| `src/components/logChart/useChartInteractions.ts` | ~330 | Mouse drag/click handlers, issue selection on chart click |
| `src/components/logChart/useIssueLabels.ts` | ~135 | Compute label positions, stacking, severity sorting |
| `src/components/logChart/useIssuePopover.ts` | ~245 | Hover/forced popover HTML, glow effect on selection |
| `src/components/LogChart.styles.ts` | ~230 | Styled components for chart, labels, popover, overlays |
| `src/components/FileUpload.tsx` | ~770 | Drag-drop upload, parse progress, metadata display |
| `src/workers/logParser.worker.ts` | ~400 | Web Worker: parses .bbl/.bfl/.txt/.csv in background |
| `src/domain/utils/CliExport.ts` | ~384 | Map recommendations → Betaflight CLI `set` commands |
| `src/domain/utils/FrequencyAnalysis.ts` | ~299 | Cooley-Tukey FFT, RMS, band energy |
| `src/domain/utils/SignalAnalysis.ts` | ~391 | Bounceback detection, settling time analysis |
| `src/lib/betaflight/cliOptions.ts` | ~1000 | Betaflight 4.5 CLI param definitions, ranges, enums |

---

## Architecture at a Glance

```
User uploads .bbl/.bfl/.txt/.csv file
    ↓
LogStore.uploadFile() → spawns Web Worker
    ↓
Worker parses binary/text → postMessage({ type: 'complete', frames, metadata })
    ↓
LogStore sets frames + metadata → triggers AnalysisStore.analyze()
    ↓
RuleEngine.analyzeLog():
  1. Segment log into 100ms windows (50% overlap)
  2. Classify flight phase per window (idle/hover/cruise/punch/propwash/flip/roll)
  3. Run each rule: condition() → detect() → recommend()
  4. Temporal dedup issues (100ms gap merge, then collapse by type+axis)
  5. Dedup recommendations (key on parameter:axis, not title)
  6. Generate summary + flight segments
    ↓
AnalysisStore.result populated → observer() components re-render
    ↓
LogChart shows traces + issue markers
RecommendationsPanel shows issues + recommendations + CLI export
```

### Layer Rules

- **Domain** (`src/domain/`): Pure TypeScript. NO React imports, NO MobX imports. Testable in isolation.
- **Stores** (`src/stores/`): MobX `makeAutoObservable`. Business logic orchestration. Can reference domain layer.
- **Components** (`src/components/`): React + `observer()`. Access stores via hooks. Emotion styled components.
- **Workers** (`src/workers/`): Background threads. Can import domain layer. Communicate via `postMessage`.

---

## How to Implement Common Tasks

### New Tuning Rule

1. Create `src/domain/rules/YourRule.ts` conforming to `TuningRule` interface:
   ```ts
   export const YourRule: TuningRule = {
     id: 'your-rule',
     name: 'Your Rule',
     description: '...',
     baseConfidence: 0.7,
     issueTypes: ['yourIssueType'],
     applicableAxes: ['roll', 'pitch', 'yaw'],
     condition(window, frames) { return /* should this window be checked? */ },
     detect(window, frames, profile) { return /* DetectedIssue[] */ },
     recommend(issues, frames, profile) { return /* Recommendation[] */ },
   }
   ```
2. Add issue type to `IssueType` union in `src/domain/types/Analysis.ts`
3. Register rule in `src/domain/engine/RuleEngine.ts` constructor: `this.registerRule(YourRule)`
4. Add chart description in `src/domain/utils/issueChartDescriptions.ts`
5. If new parameters: add to `BetaflightParameter` union in `Analysis.ts`, map in `CliExport.ts`
6. Add thresholds per quad profile in `src/domain/profiles/quadProfiles.ts`

### New React Component

```ts
import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useStores } from '../stores/RootStore'
import { useObservableState, useComputed, useAutorun } from '../lib/mobx-reactivity'

const Wrapper = styled.div`
  color: ${p => p.theme.colors.text.primary};
`

export const MyComponent = observer(() => {
  const { uiStore, analysisStore } = useStores()
  const [localState, setLocalState] = useObservableState(false)
  const derived = useComputed(() => analysisStore.issues.filter(i => i.severity === 'high'))

  useAutorun(() => {
    if (analysisStore.selectedIssue) {
      // side effect reacting to observable change
    }
  })

  return <Wrapper>...</Wrapper>
})
```

**Rules:**
- ALWAYS wrap with `observer()`
- NEVER use `useState`, `useEffect`, `useMemo`, `useCallback`
- ALWAYS use `useObservableState`, `useComputed`, `useAutorun`
- ALWAYS use Emotion styled components (no inline styles, no CSS files, no Tailwind)
- Keep under 300 lines — split by domain/concern

### New MobX Store

```ts
import { makeAutoObservable, runInAction } from 'mobx'

export class MyStore {
  publicField: string = ''
  private privateField: SomeType | null = null

  constructor() {
    makeAutoObservable<this, 'privateField'>(this, {
      privateField: false,  // exclude from observation
    })
  }

  get computed(): string {
    return this.publicField.toUpperCase()
  }

  someAction = (value: string): void => {
    this.publicField = value
  }

  someAsyncAction = async (): Promise<void> => {
    const result = await fetch(...)
    runInAction(() => {
      this.publicField = result
    })
  }

  reset = (): void => {
    this.publicField = ''
  }
}
```

Then wire in `src/stores/RootStore.ts`:
1. Add field: `myStore: MyStore`
2. Instantiate in constructor: `this.myStore = new MyStore()`
3. Add hook: `export function useMyStore() { return useStores().myStore }`
4. Add to `reset()` if applicable

### New Betaflight Parameter

1. Add to `BetaflightParameter` union in `src/domain/types/Analysis.ts`
2. Add CLI mapping in `src/domain/utils/CliExport.ts`:
   - Per-axis → `PER_AXIS_PARAMS` map
   - Global → `GLOBAL_PARAM_MAP`
3. Add display name in `PARAMETER_DISPLAY_NAMES`
4. Add CLI option metadata in `src/lib/betaflight/cliOptions.ts`
5. Add value lookup in `getPidValue()` or `getGlobalValue()`

### New Theme Color

1. Add to `ThemeColors` interface in `src/theme/types.ts`
2. Add values in `src/theme/lightTheme.ts` and `src/theme/darkTheme.ts`
3. Use in styled components: `${p => p.theme.colors.your.new.color}`

### New Modal

1. Add boolean toggle to `UIStore`: `yourModalOpen = false`
2. Add open/close actions in UIStore
3. Create component in `src/components/YourModal.tsx`
4. Render conditionally in `src/App.tsx` based on `uiStore.yourModalOpen`

---

## Store Access Hooks

```ts
useStores()              // Full RootStore (all stores)
useLogStore()            // Parsed frames, metadata, parse status
useAnalysisStore()       // Analysis results, issues, recommendations, selection
useUIStore()             // Axis, zoom, panel state, modals, toasts
useThemeStore()          // Dark/light mode, theme object
useSettingsStore()       // Imported Betaflight settings
useSerialStore()         // USB serial connection state
useFlashDownloadStore()  // Flash download progress
```

---

## 8 Registered Tuning Rules

| Rule | File | Issue Type | Detects |
|------|------|-----------|---------|
| BouncebackRule | `src/domain/rules/BouncebackRule.ts` | `bounceback` | Overshoot after stick release |
| PropwashRule | `src/domain/rules/PropwashRule.ts` | `propwash` | Low-throttle descent oscillation |
| WobbleRule | `src/domain/rules/WobbleRule.ts` | `midThrottleWobble` | Mid-throttle cruise wobble |
| TrackingQualityRule | `src/domain/rules/TrackingQualityRule.ts` | `lowFrequencyOscillation` | Gyro-setpoint tracking error |
| MotorSaturationRule | `src/domain/rules/MotorSaturationRule.ts` | `motorSaturation` | Motors hitting max output |
| DTermNoiseRule | `src/domain/rules/DTermNoiseRule.ts` | `dtermNoise` | D-term amplifying noise |
| HighThrottleOscillationRule | `src/domain/rules/HighThrottleOscillationRule.ts` | `highThrottleOscillation` | High-throttle vibration |
| GyroNoiseRule | `src/domain/rules/GyroNoiseRule.ts` | `gyroNoise` | Gyro noise floor elevation |

---

## Testing Guide

### Unit Tests (Vitest)

- Co-located with source: `src/**/*.test.ts`
- Run: `pnpm test:unit`
- Key test files:
  - `src/domain/blackbox/BblParser.test.ts` — Binary parser
  - `src/domain/engine/RuleEngine.test.ts` — Deduplication, segmentation
  - `src/domain/engine/RuleEngineProfiles.test.ts` — Profile thresholds
  - `src/domain/rules/TrackingQualityRule.test.ts` — Specific rule
  - `src/domain/utils/CliExport.test.ts` — CLI generation
  - `src/components/logChart/useIssueLabels.test.ts` — Label collision

### E2E Tests (Playwright)

- Located in `e2e/*.spec.ts`
- Helpers: `e2e/helpers.ts`, `e2e/data-verification-helpers.ts`
- Sample log: `test-logs/shortLog.BFL`
- Run: `pnpm test` (full), `pnpm test:headed` (visible browser)
- Config: `playwright.config.ts` — Chromium only, 1920x1080, 60s timeout
- **Selectors**: Use `data-testid` attributes
- **No mocking**: Real file uploads, real parsing, real analysis
- **Upload helper**: `uploadAndAnalyze(page, filePath?)` — uploads BFL and waits for analysis

**Key test files:**
| File | Tests |
|------|-------|
| `file-upload.spec.ts` | Drag-drop, file selection, parse progress |
| `analysis-summary.spec.ts` | Summary panel, issue counts |
| `analysis-details.spec.ts` | Issue details, severity, metrics |
| `chart-rendering.spec.ts` | Lines, grid, tooltips |
| `chart-interaction.spec.ts` | Zoom, pan, scroll |
| `issue-*.spec.ts` | Issue detection, stacking, popover |
| `navigation-*.spec.ts` | Panel resize, axis switch, segments |
| `settings-review.spec.ts` | Import/export settings |
| `data-verification-*.spec.ts` | Correct issues/recommendations detected |

**When to run tests:**
- After changing domain logic → run unit tests + targeted E2E
- After changing UI → run targeted E2E spec
- Don't re-run ALL tests unless there's a strong reason they might fail

---

## Commit Workflow

### Writing Commit Messages

- **Plain language** for non-technical users
- **One concern per commit** — split unrelated changes
- Good: "Show build time in user's timezone on What's New modal"
- Bad: "Emit full ISO datetime from changelogPlugin and add formatBuildDate"

### After Committing

If the change is **user-facing**, add an entry to `src/data/changelog.ts`:
```ts
{
  hash: 'abc1234',      // git short hash
  date: '2026-02-19',   // ISO date
  message: 'What the user sees changed',
  category: 'feature' | 'improvement' | 'fix',
}
```

### CI/CD Pipeline

Push to `main` triggers `.github/workflows/deploy.yml`:
1. **build** — `tsc && vite build`
2. **unit-tests** — `pnpm test:unit`
3. **integration-tests** — Playwright across 16 shards
4. **deploy** — GitHub Pages (all 3 above must pass)

---

## Key Deduplication Logic

Understanding this prevents confusion when working on analysis:

### Issue Deduplication (RuleEngine)
1. **Temporal merge**: Issues of same type+axis within 100ms gap are merged into one
2. **Collapse**: Multiple occurrences become `occurrences[]` array with count
3. Result: One `DetectedIssue` per type+axis with occurrence count

### Recommendation Deduplication (RuleEngine)
1. **Key**: `parameter:axis` from `changes[]` array (NOT title string)
2. Multiple rules recommending same parameter change are merged
3. Conflicting changes use weighted merge based on confidence

---

## Dependencies

| Package | Version | Role |
|---------|---------|------|
| `react` | 18.2.0 | UI framework |
| `react-dom` | 18.2.0 | DOM rendering |
| `mobx` | 6.12.0 | Reactive state management |
| `mobx-react-lite` | 4.0.5 | `observer()` HOC |
| `@emotion/react` | 11.14.0 | CSS-in-JS (css prop) |
| `@emotion/styled` | 11.14.1 | Styled components |
| `recharts` | 2.10.3 | SVG chart library |
| `@playwright/test` | 1.58.2 | E2E testing |
| `vitest` | 4.0.18 | Unit testing |
| `vite` | 5.0.8 | Build tool |
| `vite-plugin-pwa` | 1.2.0 | PWA manifest + service worker |
| `typescript` | 5.3.3 | Type checking |

---

## Critical Constraints

| Constraint | Reason |
|-----------|--------|
| `useDefineForClassFields: false` in tsconfig | MobX `makeAutoObservable` needs getter/setter pattern |
| No React hooks (useState, useEffect, etc.) | MobX reactive primitives replace them |
| All components wrapped in `observer()` | MobX reactivity requires it |
| Emotion styled components only | Theme-aware, dynamic dark/light mode |
| Files under 300 lines | Maintainability, split by domain |
| No `any` in domain layer | Type safety, ESLint warning-level |
| Chart adaptive downsampling (300–2500 pts) | Progressive formula + FPS feedback loop in `useChartData.ts` |
| FFT capped at 2048 samples | Avoid slowdown on large logs |
| Web Worker for parsing | Prevent main thread blocking on large files |
| No backend | Everything client-side, works offline (PWA) |

---

## Zoom System

Zoom is percentage-based (0–100%). `UIStore.zoomStart` / `zoomEnd` define the visible window.

**Minimum zoom window** is enforced in **3 places** — all must agree:

| Location | What it controls |
|----------|-----------------|
| `UIStore.setZoom()` | Safety floor when start ≥ end (0.01% absolute minimum) |
| `useChartInteractions.ts` (wheel handler) | Scroll-to-zoom on the chart area |
| `RangeSlider.tsx` (minWindow prop) | Handle drag + scroll-to-zoom on the slider |

The minimum is **dynamic based on log duration** so that full zoom always shows a 0.2s window:
```ts
const minZoomPct = (0.2 / totalDuration) * 100
```
`LogChart.tsx` computes this and passes it to `RangeSlider` via the `minWindow` prop. The chart scroll handler in `useChartInteractions` computes the same value from `logStore.duration`.

---

## Mobile Layout

- Breakpoint: `max-width: 1599px` → mobile layout
- `UIStore.isMobileLayout` observable (media query listener)
- Mobile: 3-tab bottom bar (Upload / Chart / Tune) via `BottomTabBar`
- Desktop: 3-panel layout (left / chart / right) with drag-to-resize
- Touch targets: minimum 36x36px, 18px font on `pointer: coarse`
- No serial options on mobile (WebSerial is desktop Chrome/Edge only)

---

## Serial Communication (USB)

- `src/serial/SerialPort.ts` — WebSerial API wrapper
- `src/serial/MspProtocol.ts` — MSP protocol (read FC state)
- `src/serial/CliProtocol.ts` — Enter/exit CLI, read/write settings
- `src/serial/DataflashReader.ts` — Download blackbox from FC flash memory
- Chrome/Edge only (WebSerial API)
- Flow: connect → enter CLI → dump settings → parse → show in SettingsImportModal

---

## Vite Plugins

### changelogPlugin (`vite-plugins/changelogPlugin.ts`)
- Provides `virtual:changelog` module
- Injects: `entries[]`, `buildDate` (ISO), `buildHash` (git short hash)
- Watches `src/data/changelog.ts` for HMR
- Used by ChangelogModal for "What's New" feature

---

## Panel Resize Pattern (Drag Performance)

When resizing panels adjacent to the chart (expensive Recharts component):
1. **Freeze** inner chart wrapper at current pixel width on drag start
2. **During drag**: only change panel width via direct DOM (no MobX, no React re-renders)
3. **On mouseup**: clear inline styles, commit final width to MobX in single `runInAction`
4. Result: zero ResizeObserver fires, zero React re-renders during drag

---

## Quad Profiles

5 profiles in `src/domain/profiles/quadProfiles.ts`:

| Profile | Multiplier Range | Notes |
|---------|-----------------|-------|
| Whoop (65-85mm) | 1.5-2.5x (relaxed) | More noise tolerance |
| 3" (micro) | 1.1-1.3x | Balanced |
| 5" (baseline) | 1.0x | All thresholds calibrated here |
| 7" (long-range) | 0.7-1.3x | Varies per issue |
| X-Class (10"+) | 0.6-1.5x | More propwash, less noise |

`actualThreshold = baseThreshold * profile.thresholds[issueType]`
