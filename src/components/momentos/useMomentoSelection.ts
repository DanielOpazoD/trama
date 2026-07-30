import { useEffect, useMemo, useState } from 'react'
import type { Momento } from '../../types'

/**
 * Modo selección del timeline de Momentos.
 *
 * Cuando está activo:
 *   - el toggle de la barra cambia a "salir"
 *   - cada momento se vuelve clickeable como checkbox (sin abrir nada)
 *   - aparece la MergeMomentosBar flotante al pie
 *
 * Al fusionar (o cancelar), salimos del modo y limpiamos la selección.
 *
 * El efecto de limpieza no es cosmético: si el usuario cambia a vista álbum con
 * el modo activo, la barra flotante quedaría huérfana — el álbum no renderiza
 * los `SelectableMomento`, el envoltorio vive sólo en el timeline.
 */
export function useMomentoSelection(items: Momento[], viewMode: 'timeline' | 'album') {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const selectedMomentos = useMemo(
    () => items.filter((m) => selectedIds.has(m.id)),
    [items, selectedIds],
  )

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelection(): void {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  function toggleSelectionMode(): void {
    if (selectionMode) exitSelection()
    else setSelectionMode(true)
  }

  useEffect(() => {
    if (viewMode !== 'timeline' && selectionMode) {
      setSelectionMode(false)
      setSelectedIds(new Set())
    }
  }, [viewMode, selectionMode])

  return {
    selectionMode,
    selectedIds,
    selectedMomentos,
    toggleSelect,
    exitSelection,
    toggleSelectionMode,
  }
}
