import { autorun } from 'mobx'
import { useEffect, useRef } from 'react'

/**
 * Runs a MobX autorun tied to the component lifecycle. The autorun is
 * created once and disposed on unmount.
 *
 * Uses a ref to the latest fn so the autorun always calls the current
 * closure (no stale captured values). MobX tracks observable reads
 * inside fn and re-runs the autorun when they change.
 */
export function useAutorun(fn: () => void): void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => autorun(() => fnRef.current()), []) // eslint-disable-line react-hooks/exhaustive-deps
}
