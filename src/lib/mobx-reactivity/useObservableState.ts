import { runInAction } from 'mobx'
import { useLocalObservable } from 'mobx-react-lite'

/**
 * MobX-backed local state. Replaces useState for state that participates in
 * MobX reactivity (computed, autorun, observer re-renders).
 *
 * Returns a getter/setter tuple identical to useState's API so call-sites
 * can migrate with minimal diff.
 */
export function useObservableState<T>(initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const state = useLocalObservable(() => ({
    value: initial,
  }))
  const setter = (v: T | ((prev: T) => T)): void => {
    runInAction(() => {
      state.value = typeof v === 'function' ? (v as (prev: T) => T)(state.value) : v
    })
  }
  return [state.value, setter]
}
