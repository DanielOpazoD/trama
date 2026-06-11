import { useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { type PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { PageCard } from './PageCard'
import type { PageInteractionMode } from '../shell/pdfStudioPageInteractionMode'

/**
 * FLIP: al reordenar, cada hoja viaja de su posición vieja a la nueva en vez de
 * teletransportarse. Mide los rects por `data-page-id` ANTES del paint del nuevo
 * orden y anima el delta invertido hacia cero con la curva canónica out-quart.
 * Respeta `prefers-reduced-motion` y degrada en silencio donde no hay WAAPI
 * (happy-dom de los tests).
 */
function useFlipPages(listRef: React.RefObject<HTMLUListElement | null>, dep: unknown) {
  const rectsRef = useRef<Map<string, DOMRect>>(new Map())
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const prev = rectsRef.current
    const next = new Map<string, DOMRect>()
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const el of Array.from(list.children) as HTMLElement[]) {
      const id = el.dataset.pageId
      if (!id) continue
      const rect = el.getBoundingClientRect()
      next.set(id, rect)
      const old = prev.get(id)
      if (reduced || !old || typeof el.animate !== 'function') continue
      const dx = old.left - rect.left
      const dy = old.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 220, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
      )
    }
    rectsRef.current = next
  }, [listRef, dep])
}

/**
 * Grilla de miniaturas reordenables. Es dueña del estado VISUAL del arrastre
 * (qué card se arrastra / sobre cuál está) y traduce el drop a `onReorder`; el
 * resto de las acciones por página suben al contenedor con el índice. Las
 * mutaciones del documento y la selección viven en `PdfStudioView`.
 */
export function PageGrid({
  doc,
  interactionMode = 'editor',
  selectedIds,
  onToggleSelect,
  onReorder,
  onNudge,
  onOpenText,
  onDropFiles,
  scrollRoot,
}: {
  doc: PdfDoc
  interactionMode?: PageInteractionMode
  selectedIds: Set<string>
  onToggleSelect: (index: number, shift: boolean) => void
  onReorder: (from: number, to: number, movingIndices?: number[]) => void
  onNudge: (index: number, delta: -1 | 1) => void
  onOpenText: (index: number) => void
  onDropFiles: (e: DragEvent) => void
  /** Contenedor scrolleable del área de trabajo: raíz del IntersectionObserver del
   *  lazy-load de miniaturas (si no, observa el viewport y precarga de más). */
  scrollRoot: Element | null
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragGroupIndicesRef = useRef<number[]>([])
  const total = doc.pages.length
  const listRef = useRef<HTMLUListElement>(null)
  useFlipPages(listRef, doc.pages)

  const endDrag = () => {
    setDragIndex(null)
    setDragOverIndex(null)
    dragGroupIndicesRef.current = []
  }

  return (
    <ul
      ref={listRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFiles}
      className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5"
    >
      {doc.pages.map((page, index) => (
        <PageCard
          key={page.id}
          doc={doc}
          interactionMode={interactionMode}
          page={page}
          index={index}
          total={total}
          selected={selectedIds.has(page.id)}
          dragging={dragIndex === index}
          isDropTarget={
            dragIndex !== null && dragOverIndex === index && dragIndex !== index
          }
          onToggleSelect={(shift) => onToggleSelect(index, shift)}
          onDragStart={() => {
            setDragIndex(index)
            const moving = selectedIds.has(page.id)
              ? doc.pages.reduce<number[]>((acc, candidate, candidateIndex) => {
                  if (selectedIds.has(candidate.id)) acc.push(candidateIndex)
                  return acc
                }, [])
              : [index]
            dragGroupIndicesRef.current = moving
          }}
          onDragEnterCard={() => setDragOverIndex(index)}
          onDragEnd={endDrag}
          onDropOn={() => {
            if (dragIndex !== null)
              onReorder(dragIndex, index, dragGroupIndicesRef.current)
            endDrag()
          }}
          onNudge={onNudge}
          onOpenText={() => onOpenText(index)}
          scrollRoot={scrollRoot}
        />
      ))}
    </ul>
  )
}
