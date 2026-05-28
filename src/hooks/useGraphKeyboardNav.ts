import { useCallback, useEffect, useState } from 'react'
import type { Entity } from '../types'

/**
 * Navegación con teclado para el SVG del grafo:
 *   - ArrowRight / ArrowDown / Tab → siguiente nodo
 *   - ArrowLeft / ArrowUp → nodo anterior
 *   - Enter / Espacio → toggle selección del nodo enfocado
 *   - Escape → deseleccionar y limpiar foco
 *
 * Devuelve `focusedIndex` (para que el caller resalte el nodo y
 * configure `aria-activedescendant`) y `onKeyDown` para colgar en el
 * elemento focusable.
 *
 * `focusedIndex` se resetea automáticamente si `entities.length` baja
 * por debajo del índice actual — evita un index out-of-bounds tras
 * borrar entidades.
 */
export function useGraphKeyboardNav({
  entities,
  selectedId,
  onSelect,
}: {
  entities: Entity[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  useEffect(() => {
    if (focusedIndex >= entities.length) setFocusedIndex(-1)
  }, [entities.length, focusedIndex])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (entities.length === 0) return
      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        event.key === 'Tab'
      ) {
        if (event.key === 'Tab' && event.shiftKey) return
        event.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % entities.length)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex((prev) => (prev <= 0 ? entities.length - 1 : prev - 1))
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < entities.length) {
          const id = entities[focusedIndex]!.id
          onSelect(id === selectedId ? null : id)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onSelect(null)
        setFocusedIndex(-1)
      }
    },
    [entities, focusedIndex, onSelect, selectedId],
  )

  return { focusedIndex, setFocusedIndex, onKeyDown }
}
