import { useRef, cloneElement, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styled from '@emotion/styled'

const Bubble = styled.span`
  position: fixed;
  white-space: nowrap;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 400;
  line-height: 1.4;
  color: ${p => p.theme.colors.text.primary};
  background-color: ${p => p.theme.colors.chart.tooltipBg};
  border: 1px solid ${p => p.theme.colors.chart.tooltipBorder};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  opacity: 0;
  z-index: 10000;
  transition: opacity 0.15s;
`

interface TooltipProps {
  text: string
  children: ReactElement
  maxWidth?: number
}

export function Tooltip({ text, children, maxWidth }: TooltipProps): ReactNode {
  const ref = useRef<HTMLSpanElement>(null)

  if (!text) return children

  const show = (e: React.MouseEvent): void => {
    const el = ref.current
    if (!el) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

    const bw = el.offsetWidth
    const bh = el.offsetHeight

    let top = rect.bottom + 6
    let left = rect.left + rect.width / 2

    if (top + bh > window.innerHeight - 8) {
      top = rect.top - bh - 6
    }

    left = Math.max(8 + bw / 2, Math.min(left, window.innerWidth - 8 - bw / 2))

    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.transform = 'translateX(-50%)'
    el.style.opacity = '1'
  }

  const hide = (): void => {
    if (ref.current) ref.current.style.opacity = '0'
  }

  const enhanced = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e)
      show(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e)
      hide()
    },
    onMouseDown: (e: React.MouseEvent) => {
      children.props.onMouseDown?.(e)
      hide()
    },
  })

  const bubbleStyle = maxWidth
    ? { opacity: 0, maxWidth: `${maxWidth}px`, whiteSpace: 'normal' as const }
    : { opacity: 0 }

  return (
    <>
      {enhanced}
      {createPortal(<Bubble ref={ref} style={bubbleStyle}>{text}</Bubble>, document.body)}
    </>
  )
}
