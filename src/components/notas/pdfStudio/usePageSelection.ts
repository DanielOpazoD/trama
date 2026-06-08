import { useCallback, useRef, useState } from 'react'
import { type PdfPage } from '../../../lib/pdfStudio/model/model'

export type PageSelection = {
  /** IDs de las páginas seleccionadas (por ID → sobrevive reordenar/borrar). */
  selectedIds: Set<string>
  /** Índices (en orden de documento) de las seleccionadas que aún existen. */
  selectedIndices: number[]
  selectedCount: number
  /** Alterna una página; con Shift selecciona el rango desde el último clic. */
  toggleSelect: (index: number, shift: boolean) => void
  clearSelection: () => void
  selectAll: () => void
}

/**
 * Selección múltiple de páginas para las acciones en lote. Guarda los IDs (no los
 * índices) para sobrevivir a reordenar/borrar, y un ancla con el último clic para
 * extender rangos con Shift. Recibe las páginas ACTUALES para mapear índice↔id.
 */
export function usePageSelection(pages: PdfPage[]): PageSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const anchorRef = useRef<number | null>(null)

  const selectedIndices = pages.reduce<number[]>((acc, p, i) => {
    if (selectedIds.has(p.id)) acc.push(i)
    return acc
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    anchorRef.current = null
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(pages.map((p) => p.id)))
  }, [pages])

  const toggleSelect = useCallback(
    (index: number, shift: boolean) => {
      // Capturar el ancla ANTES de actualizar: `setSelectedIds` corre su updater
      // de forma diferida (tras el handler), y abajo movemos el ancla a `index`;
      // si el updater leyera `anchorRef.current` vería ya el valor nuevo y el
      // rango colapsaría a [index, index]. Por eso lo congelamos acá.
      const anchor = anchorRef.current
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (shift && anchor !== null) {
          const lo = Math.min(anchor, index)
          const hi = Math.max(anchor, index)
          for (let i = lo; i <= hi; i++) {
            const id = pages[i]?.id
            if (id) next.add(id)
          }
        } else {
          const id = pages[index]?.id
          if (id) {
            if (next.has(id)) next.delete(id)
            else next.add(id)
          }
        }
        return next
      })
      anchorRef.current = index
    },
    [pages],
  )

  return {
    selectedIds,
    selectedIndices,
    selectedCount: selectedIndices.length,
    toggleSelect,
    clearSelection,
    selectAll,
  }
}
