import type { ReactNode, RefObject, UIEvent } from 'react'

export function PdfTextEditorScrollArea({
  children,
  fillMode,
  onScroll,
  positioning = false,
  scrollContainerRef,
}: {
  children: ReactNode
  fillMode: boolean
  onScroll?: (event: UIEvent<HTMLDivElement>) => void
  positioning?: boolean
  scrollContainerRef: RefObject<HTMLDivElement>
}) {
  return (
    <div
      data-pdf-editor-scroll
      data-pdf-editor-positioning={positioning ? 'initial' : 'settled'}
      role={fillMode ? 'main' : undefined}
      aria-label={fillMode ? 'Área de relleno de planilla' : undefined}
      aria-busy={positioning || undefined}
      ref={scrollContainerRef}
      onScroll={onScroll}
      className={`min-h-0 flex-1 overflow-auto overscroll-contain bg-ink-100/30 px-3 py-4 [overflow-anchor:none] ${
        positioning ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {children}
    </div>
  )
}
