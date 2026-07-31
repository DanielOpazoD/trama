import type { ReactNode, RefObject, UIEvent } from 'react'

export function PdfTextEditorScrollArea({
  children,
  fillMode,
  onScroll,
  positioning = false,
  opening = false,
  scrollContainerRef,
}: {
  children: ReactNode
  fillMode: boolean
  onScroll?: (event: UIEvent<HTMLDivElement>) => void
  /** Oculta la hoja hasta la primera colocación real. Es SÓLO visibilidad. */
  positioning?: boolean
  /**
   * El pin de apertura sigue recentrando. Vive aparte de `positioning` porque
   * se apagan en momentos distintos: la hoja se revela en cuanto está puesta,
   * pero la colocación continúa mientras las de arriba se inflan. El atributo
   * `data-pdf-editor-positioning` publica ESTE, que es el que responde «¿puedo
   * medir ya?».
   */
  opening?: boolean
  scrollContainerRef: RefObject<HTMLDivElement>
}) {
  return (
    <div
      data-pdf-editor-scroll
      data-pdf-editor-positioning={positioning || opening ? 'initial' : 'settled'}
      role={fillMode ? 'main' : undefined}
      aria-label={fillMode ? 'Área de relleno de planilla' : undefined}
      aria-busy={positioning || opening || undefined}
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
