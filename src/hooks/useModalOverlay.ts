import { useEffect, useRef } from 'react'
import { useBodyScrollLock } from './useBodyScrollLock'
import { useFocusTrap } from './useFocusTrap'

let nextOverlayId = 0
let overlayStack: number[] = []

function removeOverlay(id: number) {
  overlayStack = overlayStack.filter((current) => current !== id)
}

function isTopOverlay(id: number) {
  return overlayStack[overlayStack.length - 1] === id
}

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
  const overlayIdRef = useRef<number | null>(null)
  if (overlayIdRef.current === null) {
    overlayIdRef.current = nextOverlayId
    nextOverlayId += 1
  }

  useFocusTrap(dialogRef, open && trapFocus)
  useBodyScrollLock(open && lockScroll)

  useEffect(() => {
    if (!open) return
    const overlayId = overlayIdRef.current!
    overlayStack.push(overlayId)

    return () => removeOverlay(overlayId)
  }, [open])

  useEffect(() => {
    if (!open) return
    const overlayId = overlayIdRef.current!

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!isTopOverlay(overlayId)) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (closeOnEscape) onClose()
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [closeOnEscape, onClose, open])

  return { dialogRef }
}
