import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type AnchoredPopoverPosition = {
  top?: number
  bottom?: number
  right: number
}

export function useAnchoredPopover({
  offset = 6,
  flipThreshold = 260,
  onClose,
}: {
  offset?: number
  flipThreshold?: number
  onClose?: () => void
} = {}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<AnchoredPopoverPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (current) onClose?.()
      return !current
    })
  }, [onClose])

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return false

    const right = window.innerWidth - rect.right
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < flipThreshold) {
      setPosition({ bottom: window.innerHeight - rect.top + offset, right })
    } else {
      setPosition({ top: rect.bottom + offset, right })
    }
    return true
  }, [flipThreshold, offset])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    function onDown(event: MouseEvent) {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !layerRef.current?.contains(target)) {
        close()
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }

    function onReflow() {
      if (!updatePosition()) close()
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [close, open, updatePosition])

  return {
    close,
    layerRef,
    open,
    position,
    setOpen,
    toggle,
    triggerRef,
  }
}
