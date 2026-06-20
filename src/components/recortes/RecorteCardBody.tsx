import type { Ref } from 'react'
import type { Recorte } from '../../api'
import { ChevronDownIcon } from '../Icons'
import { markdownToPreview } from './recorteMarkdownPreview'

export function RecorteCardBody({
  recorte,
  bodyRef,
  overflowing,
  expanded,
  collapsedMaxPx,
  onExpandedChange,
}: {
  recorte: Recorte
  bodyRef: Ref<HTMLParagraphElement>
  overflowing: boolean
  expanded: boolean
  collapsedMaxPx: number
  onExpandedChange: (expanded: boolean) => void
}) {
  return (
    <div className={`relative ${overflowing && !expanded ? 'pb-8' : ''}`}>
      <p
        ref={bodyRef}
        className="mt-1.5 overflow-hidden whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700"
        style={overflowing && !expanded ? { maxHeight: collapsedMaxPx } : undefined}
      >
        {recorte.captureMode === 'html' || recorte.captureMode === 'article'
          ? markdownToPreview(recorte.text)
          : `«${recorte.text}»`}
      </p>
      {overflowing && !expanded && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent via-paper-100/90 to-paper-100"
        />
      )}

      {overflowing && !expanded && (
        <div
          data-testid="recorte-collapse-control"
          className="absolute inset-x-0 bottom-1 flex justify-center"
        >
          <button
            type="button"
            onClick={() => onExpandedChange(true)}
            aria-expanded={false}
            aria-label="Leer la captura completa"
            title="Leer completa"
            className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink-100/70 bg-paper-50/90 text-ink-300 shadow-sm shadow-ink-900/5 backdrop-blur transition-colors hover:bg-paper-50 hover:text-ink-700"
          >
            <ChevronDownIcon size={16} className="transition-transform duration-300" />
          </button>
        </div>
      )}

      {overflowing && expanded && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={() => onExpandedChange(false)}
            aria-expanded={true}
            aria-label="Mostrar menos"
            title="Mostrar menos"
            className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <ChevronDownIcon
              size={16}
              className="rotate-180 transition-transform duration-300"
            />
          </button>
        </div>
      )}
    </div>
  )
}
