import type { ReactNode, RefObject } from 'react'

export function PdfTextEditorScrollArea({
  children,
  fillMode,
  scrollContainerRef,
}: {
  children: ReactNode
  fillMode: boolean
  scrollContainerRef: RefObject<HTMLDivElement>
}) {
  return (
    <div
      data-pdf-editor-scroll
      role={fillMode ? 'main' : undefined}
      aria-label={fillMode ? 'Área de relleno de planilla' : undefined}
      ref={scrollContainerRef}
      className="min-h-0 flex-1 overflow-auto overscroll-contain bg-ink-100/30 px-3 py-4 [overflow-anchor:none]"
    >
      {children}
    </div>
  )
}
