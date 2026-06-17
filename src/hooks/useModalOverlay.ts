import { useEffect, useRef } from 'react'
import { useBodyScrollLock } from './useBodyScrollLock'
import { useFocusTrap } from './useFocusTrap'

export function useModalOverlay({
  open,
  onClose,
  trapFocus = true,
  lockScroll = true,
  closeOnEscape = true,
}: {
  open: boolean
  onClose: () => void
  trapFocus?: boolean
  lockScroll?: boolean
  closeOnEscape?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap(dialogRef, open && trapFocus)
  useBodyScrollLock(open && lockScroll)

  useEffect(() => {
    if (!open || !closeOnEscape) return

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [closeOnEscape, onClose, open])

  return { dialogRef }
}
