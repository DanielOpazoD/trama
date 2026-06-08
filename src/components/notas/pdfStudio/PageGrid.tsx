import { useState, type DragEvent } from 'react'
import { type PdfDoc } from '../../../lib/pdfStudio/model'
import { PageCard } from './PageCard'
import type { PageInteractionMode } from './pdfStudioPageInteractionMode'

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
  onReorder: (from: number, to: number) => void
  onNudge: (index: number, delta: -1 | 1) => void
  onOpenText: (index: number) => void
  onDropFiles: (e: DragEvent) => void
  /** Contenedor scrolleable del área de trabajo: raíz del IntersectionObserver del
   *  lazy-load de miniaturas (si no, observa el viewport y precarga de más). */
  scrollRoot: Element | null
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const total = doc.pages.length

  const endDrag = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <ul
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
          onDragStart={() => setDragIndex(index)}
          onDragEnterCard={() => setDragOverIndex(index)}
          onDragEnd={endDrag}
          onDropOn={() => {
            if (dragIndex !== null) onReorder(dragIndex, index)
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
