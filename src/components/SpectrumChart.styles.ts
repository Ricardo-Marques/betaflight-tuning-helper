import styled from '@emotion/styled'

export const SpectrumContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 1rem;
  position: relative;
  display: flex;
  flex-direction: column;
`

export const SpectrumInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0 0;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  flex-wrap: wrap;
`

export const SpectrumInfoLabel = styled.span`
  white-space: nowrap;
`

export const PeakBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
  background-color: ${p => p.theme.colors.background.selected};
  color: ${p => p.theme.colors.text.primary};
  border: 1px solid ${p => p.theme.colors.border.subtle};
`

export const PeakDot = styled.span`
  display: inline-block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
`

export const InsufficientData = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: ${p => p.theme.colors.text.muted};
  font-size: 0.875rem;
`
