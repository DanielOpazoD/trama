import { useEffect } from 'react'

type GlobalShortcutsOptions = {
  onTogglePalette: () => void
  onOpenPalette: () => void
  onToggleShortcuts: () => void
  onToggleFocusMode: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function useGlobalShortcuts({
  onTogglePalette,
  onOpenPalette,
  onToggleShortcuts,
  onToggleFocusMode,
}: GlobalShortcutsOptions): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onTogglePalette()
        return
      }
      if (isEditableTarget(e.target)) return

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onOpenPalette()
        return
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onToggleShortcuts()
        return
      }
      if (e.key === '\\' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onToggleFocusMode()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpenPalette, onToggleFocusMode, onTogglePalette, onToggleShortcuts])
}
