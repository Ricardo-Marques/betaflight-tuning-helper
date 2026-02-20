# Contributing

## Tech Stack

React 18, TypeScript (strict), MobX, Vite, Recharts, Emotion (styled components), Web Workers

## Getting Started

```bash
pnpm install
pnpm dev           # http://localhost:5173
```

### Build

```bash
pnpm build         # Output in dist/
pnpm preview       # Preview production build locally
```

### Tests

```bash
pnpm test          # Playwright e2e tests
pnpm lint          # ESLint
```

## Project Structure

```
src/
  domain/
    blackbox/                     # Native TypeScript BBL/BFL binary parser
    engine/RuleEngine.ts          # Orchestrates analysis: windowing, dedup, recommendations
    rules/                        # 18 detection rules (tuning + hardware + meta-analysis)
    types/                        # LogFrame, Analysis, TuningRule interfaces
    utils/                        # FFT, signal analysis algorithms
  stores/                         # MobX stores (LogStore, AnalysisStore, UIStore)
  components/                     # React components (FileUpload, LogChart, etc.)
  lib/mobx-reactivity/            # MobX reactive primitives (useObservableState, useComputed, useAutorun)
  theme/                          # Theme system (dark/light themes, ThemeStore, GlobalStyles)
  workers/logParser.worker.ts     # Background log parser
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

## Deployment

The app deploys automatically to GitHub Pages on every push to `main` via the workflow in `.github/workflows/deploy.yml`.

To set up GitHub Pages for your fork:

1. Push the repo to GitHub
2. Go to **Settings > Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` — the workflow will build and deploy automatically

The Vite config reads the repo name from the `GITHUB_REPOSITORY` environment variable at build time, so no hardcoded base path is needed.
