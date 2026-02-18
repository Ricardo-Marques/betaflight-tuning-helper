import styled from '@emotion/styled'

export const ChartWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  color: ${p => p.theme.colors.text.primary};
`

export const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${p => p.theme.colors.text.muted};
`

export const AxisBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
`

export const AxisLabel = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.primary};
`

export const AxisButton = styled.button<{ isActive: boolean }>`
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
  border: none;
  cursor: pointer;
  color: ${p => p.isActive ? p.theme.colors.button.primaryText : p.theme.colors.text.primary};
  background-color: ${p => p.isActive ? p.theme.colors.button.primary : p.theme.colors.button.secondary};

  &:hover {
    background-color: ${p => p.isActive ? p.theme.colors.button.primaryHover : p.theme.colors.button.secondaryHover};
  }
`

export const ToggleBar = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

export const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};
`

export const StyledCheckbox = styled.input`
  border-radius: 0.25rem;
`

export const IssueSummaryStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.background.section};
`

export const IssueSummaryLabel = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
`

export const IssuePillList = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`

export const IssuePill = styled.button`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`

export const IssueDot = styled.span`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
`

export const ChartContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 1rem;
  position: relative;
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`

export const LabelOverlay = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  height: 20px;
  pointer-events: none;
  z-index: 10;
`

export const ChartLabel = styled.span`
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: all;
  cursor: default;
`

export const HoverPopover = styled.div`
  position: fixed;
  z-index: 50;
  pointer-events: none;
  background-color: ${p => p.theme.colors.background.panel};
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  padding: 0.75rem;
  max-width: 40rem;
`

export const ZoomControls = styled.div`
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};
`

export const ZoomHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
`

export const ZoomInfoLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.secondary};
`

export const ZoomResetBtn = styled.button`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.link};
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
  }
`
