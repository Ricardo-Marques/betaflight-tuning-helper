import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { useUIStore } from '../stores/RootStore'
import type { ToastType } from '../stores/UIStore'

const slideIn = keyframes`
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`

const ToastContainer = styled.div<{ toastType: ToastType }>`
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px rgb(0 0 0 / 0.2);
  animation: ${slideIn} 0.2s ease-out;
  max-width: 90vw;
  background-color: ${p =>
    p.toastType === 'error'
      ? p.theme.colors.severity.highBg
      : p.toastType === 'success'
        ? p.theme.colors.accent.greenBg
        : p.theme.colors.accent.indigoBg};
  border: 1px solid ${p =>
    p.toastType === 'error'
      ? p.theme.colors.severity.high
      : p.toastType === 'success'
        ? p.theme.colors.accent.green
        : p.theme.colors.accent.indigo};
`

const ToastMessage = styled.span<{ toastType: ToastType }>`
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
  color: ${p =>
    p.toastType === 'error'
      ? p.theme.colors.severity.highText
      : p.toastType === 'success'
        ? p.theme.colors.accent.greenText
        : p.theme.colors.accent.indigoText};
`

const DismissButton = styled.button<{ toastType: ToastType }>`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  flex-shrink: 0;
  color: ${p =>
    p.toastType === 'error'
      ? p.theme.colors.severity.highText
      : p.toastType === 'success'
        ? p.theme.colors.accent.greenText
        : p.theme.colors.accent.indigoText};
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
`

export const Toast = observer(() => {
  const uiStore = useUIStore()

  if (!uiStore.toastVisible) return null

  return (
    <ToastContainer toastType={uiStore.toastType}>
      <ToastMessage toastType={uiStore.toastType}>
        {uiStore.toastMessage}
      </ToastMessage>
      <DismissButton toastType={uiStore.toastType} onClick={uiStore.dismissToast}>
        &times;
      </DismissButton>
    </ToastContainer>
  )
})
