import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useRef } from 'react'
import { useAutorun } from '../lib/mobx-reactivity'

const DEFAULT_MIN_WINDOW = 1 // 1% fallback minimum zoom window
const HANDLE_W_PX = 12 // must match RangeSliderHandle width

const RangeSliderWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 28px;
  margin-bottom: 0.75rem;
  user-select: none;
  cursor: grab;
  overflow: hidden;

  &:active {
    cursor: grabbing;
  }
`

const RangeSliderTrack = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 3px;
  background-color: ${p => p.theme.colors.button.secondary};
`

const MIN_FILL_PX = 40 // minimum grabbable width at deep zoom

const RangeSliderFill = styled.div`
  position: absolute;
  top: 50%;
  height: 10px;
  border-radius: 5px;
  background-color: ${p => p.theme.colors.button.primary};
  z-index: 1;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const RangeSliderAccent = styled.div`
  position: absolute;
  top: 50%;
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.35);
  pointer-events: none;
  z-index: 1;
`

const RangeSliderHandle = styled.div`
  position: absolute;
  top: 50%;
  width: 12px;
  height: 24px;
  border-radius: 4px;
  background-color: ${p => p.theme.colors.button.primary};
  border: 1px solid ${p => p.theme.colors.button.primaryText};
  cursor: ew-resize;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
`

const HandleDot = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: ${p => p.theme.colors.button.primaryText};
  opacity: 0.7;
`

interface RangeSliderProps {
  start: number
  end: number
  onChange: (start: number, end: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onEdgeHit?: () => void
  onFullZoomAttempt?: () => void
  onMaxZoomAttempt?: () => void
  minWindow?: number
}

export const RangeSlider = observer(({ start, end, onChange, onDragStart, onDragEnd, onEdgeHit, onFullZoomAttempt, onMaxZoomAttempt, minWindow }: RangeSliderProps) => {
  const MIN_WINDOW = minWindow ?? DEFAULT_MIN_WINDOW
  const wrapperRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragType = useRef<'start' | 'end' | 'fill' | null>(null)
  const dragOrigin = useRef<{ x: number; startVal: number; endVal: number }>({ x: 0, startVal: 0, endVal: 0 })
  const hintFired = useRef(false)
  const propsRef = useRef({ start, end, onChange, onDragStart, onDragEnd, onEdgeHit, onFullZoomAttempt, onMaxZoomAttempt, MIN_WINDOW })
  propsRef.current = { start, end, onChange, onDragStart, onDragEnd, onEdgeHit, onFullZoomAttempt, onMaxZoomAttempt, MIN_WINDOW }

  // rAF throttle: store pending values, commit once per frame
  const rafId = useRef<number>(0)
  const pendingUpdate = useRef<{ start: number; end: number } | null>(null)

  const pctFromEvent = (clientX: number): number => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }

  const flushPending = (): void => {
    rafId.current = 0
    if (pendingUpdate.current) {
      propsRef.current.onChange(pendingUpdate.current.start, pendingUpdate.current.end)
      pendingUpdate.current = null
    }
  }

  const scheduleUpdate = (newStart: number, newEnd: number): void => {
    pendingUpdate.current = { start: newStart, end: newEnd }
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(flushPending)
    }
  }

  // Imperative attach/detach for document-level drag listeners
  const handleMouseMove = (e: MouseEvent): void => {
    if (!dragType.current) return
    e.preventDefault()
    const { start: s, end: e2 } = propsRef.current
    const pct = pctFromEvent(e.clientX)

    if (dragType.current === 'start') {
      scheduleUpdate(Math.min(pct, e2 - MIN_WINDOW), e2)
    } else if (dragType.current === 'end') {
      scheduleUpdate(s, Math.max(pct, s + MIN_WINDOW))
    } else if (dragType.current === 'fill') {
      const trackRect = trackRef.current?.getBoundingClientRect()
      if (!trackRect) return
      const pxDelta = e.clientX - dragOrigin.current.x
      const pctDelta = (pxDelta / trackRect.width) * 100
      let newStart = dragOrigin.current.startVal + pctDelta
      let newEnd = dragOrigin.current.endVal + pctDelta

      const windowSize = dragOrigin.current.endVal - dragOrigin.current.startVal
      if (windowSize >= 99.99) {
        propsRef.current.onFullZoomAttempt?.()
      } else if (!hintFired.current && (newStart < 0 || newEnd > 100)) {
        hintFired.current = true
        propsRef.current.onEdgeHit?.()
      }

      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      scheduleUpdate(Math.max(0, newStart), Math.min(100, newEnd))
    }
  }

  const handleMouseUp = (): void => {
    dragType.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    // Flush any pending rAF update immediately
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0 }
    if (pendingUpdate.current) {
      propsRef.current.onChange(pendingUpdate.current.start, pendingUpdate.current.end)
      pendingUpdate.current = null
    }
    propsRef.current.onDragEnd?.()
  }

  const startDrag = (type: 'start' | 'end' | 'fill', e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragType.current = type
    hintFired.current = false
    dragOrigin.current = { x: e.clientX, startVal: propsRef.current.start, endVal: propsRef.current.end }
    propsRef.current.onDragStart?.()
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Scroll-to-zoom on range slider via useAutorun
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  const wheelEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wheelActive = useRef(false)
  useAutorun(() => {
    wheelCleanupRef.current?.()
    wheelCleanupRef.current = null
    const el = wrapperRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const { start: s, end: e2, onDragStart, onDragEnd, MIN_WINDOW: minW } = propsRef.current
      // Chain from pending update so consecutive ticks accumulate correctly
      const curStart = pendingUpdate.current?.start ?? s
      const curEnd = pendingUpdate.current?.end ?? e2
      const dur = curEnd - curStart
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const newDur = Math.min(100, Math.max(minW, dur * factor))

      // At full zoom trying to zoom out further — show hint
      if (dur >= 99.99 && newDur >= 99.99) {
        propsRef.current.onFullZoomAttempt?.()
      }
      // At max zoom trying to zoom in further — show hint
      if (dur <= minW + 0.01 && newDur <= minW + 0.01 && e.deltaY < 0) {
        propsRef.current.onMaxZoomAttempt?.()
      }

      const rect = el.getBoundingClientRect()
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const center = curStart + dur * cursorRatio
      let newStart = center - newDur * cursorRatio
      let newEnd = center + newDur * (1 - cursorRatio)
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }

      // Activate downsampling on first wheel tick
      if (!wheelActive.current) {
        wheelActive.current = true
        onDragStart?.()
      }
      scheduleUpdate(Math.max(0, newStart), Math.min(100, newEnd))

      // Debounce wheel-end: flush pending + restore full resolution
      if (wheelEndTimer.current) clearTimeout(wheelEndTimer.current)
      wheelEndTimer.current = setTimeout(() => {
        wheelEndTimer.current = null
        wheelActive.current = false
        if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0 }
        if (pendingUpdate.current) {
          propsRef.current.onChange(pendingUpdate.current.start, pendingUpdate.current.end)
          pendingUpdate.current = null
        }
        onDragEnd?.()
      }, 150)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    wheelCleanupRef.current = () => {
      el.removeEventListener('wheel', handleWheel)
      if (wheelEndTimer.current) { clearTimeout(wheelEndTimer.current); wheelEndTimer.current = null }
    }
  })

  // Enforce minimum visual spread so the grab region stays usable at deep zoom.
  // When natural spread is smaller than MIN_FILL_PX, expand symmetrically from center.
  const center = (start + end) / 2
  const halfMin = `${MIN_FILL_PX / 2 + HANDLE_W_PX}px`

  const leftHandleLeft = `clamp(0px, min(calc(${start}% - ${HANDLE_W_PX}px), calc(${center}% - ${halfMin})), calc(100% - ${MIN_FILL_PX + 2 * HANDLE_W_PX}px))`
  const rightHandleLeft = `clamp(${MIN_FILL_PX + HANDLE_W_PX}px, max(${end}%, calc(${center}% + ${MIN_FILL_PX / 2}px)), calc(100% - ${HANDLE_W_PX}px))`

  // Fill spans from left handle's left edge to right handle's right edge
  const fillLeft = leftHandleLeft
  const fillRight = `calc(100% - (${rightHandleLeft}) - ${HANDLE_W_PX}px)`

  const accentLeft = `max(0px, ${start}%)`
  const accentRight = `max(calc(100% - ${end}%), calc(100% - (${rightHandleLeft})))`

  return (
    <RangeSliderWrapper ref={wrapperRef} onMouseDown={e => startDrag('fill', e)}>
      <RangeSliderTrack ref={trackRef} />
      <RangeSliderFill
        style={{
          left: fillLeft,
          right: fillRight,
          transform: 'translateY(-50%)',
        }}
        onMouseDown={e => startDrag('fill', e)}
      />
      <RangeSliderAccent
        style={{
          left: accentLeft,
          right: accentRight,
          transform: 'translateY(-50%)',
        }}
      />
      <RangeSliderHandle
        style={{ left: leftHandleLeft, transform: 'translateY(-50%)' }}
        onMouseDown={e => startDrag('start', e)}
      >
        <HandleDot /><HandleDot /><HandleDot />
      </RangeSliderHandle>
      <RangeSliderHandle
        style={{ left: rightHandleLeft, transform: 'translateY(-50%)' }}
        onMouseDown={e => startDrag('end', e)}
      >
        <HandleDot /><HandleDot /><HandleDot />
      </RangeSliderHandle>
    </RangeSliderWrapper>
  )
})
