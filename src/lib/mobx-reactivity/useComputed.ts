import { computed } from 'mobx'

/**
 * MobX computed value scoped to a component render. Replaces useMemo -
 * no dependency arrays needed. MobX auto-tracks every observable read
 * inside `fn`.
 *
 * Creates a fresh computed each render so chained useComputed calls
 * always see the latest derived values (no stale closures). The
 * observer() wrapper handles render-level memoization by only
 * re-rendering when tracked observables change.
 */
export function useComputed<T>(fn: () => T): T {
  return computed(fn).get()
}
