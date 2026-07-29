import type { CSSProperties, Ref } from 'react'
import type { Recorte } from '../../api'
import { ChevronDownIcon } from '../Icons'
import { markdownToPreview } from './recorteMarkdownPreview'

/**
 * Renglones visibles antes de ofrecer «leer más». En líneas y no en píxeles:
 * los 168px de antes no eran múltiplo de la altura de línea (26px), así que el
 * séptimo renglón salía partido por la mitad.
 */
const COLLAPSED_LINES = 6
/** Respaldo para un navegador sin la unidad `lh`: recorta igual, sin cuadrar. */
const COLLAPSED_FALLBACK = '10.5rem'

/**
 * Cuerpo de una captura, con su recorte y su control de expandir.
 *
 * El control es el mismo botón de texto que usa la nota, y no el disco flotante
 * de antes —borde, sombra y `backdrop-blur` sobre el degradado—: eran dos
 * tratamientos distintos para lo mismo dentro del mismo hilo, y el más pesado
 * plantaba cromo justo donde el ojo termina de leer.
 */
export function RecorteCardBody({
  recorte,
  bodyRef,
  overflowing,
  expanded,
  onExpandedChange,
}: {
  recorte: Recorte
  bodyRef: Ref<HTMLParagraphElement>
  overflowing: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const clampStyle = {
    '--clamp-lines': COLLAPSED_LINES,
    '--clamp-fallback': COLLAPSED_FALLBACK,
  } as CSSProperties

  return (
    <div className="relative">
      <p
        ref={bodyRef}
        className={`mt-1.5 whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700 ${
          expanded ? '' : `text-clamp ${overflowing ? 'text-clamp-fade' : ''}`
        }`}
        style={expanded ? undefined : clampStyle}
      >
        {recorte.captureMode === 'html' || recorte.captureMode === 'article'
          ? markdownToPreview(recorte.text)
          : `«${recorte.text}»`}
      </p>

      {overflowing && (
        <button
          type="button"
          data-testid="recorte-collapse-control"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Mostrar menos' : 'Leer la captura completa'}
          className="mt-1 inline-flex items-center gap-1 text-micro font-medium text-ink-400 transition-colors hover:text-ink-700"
        >
          <ChevronDownIcon
            size={13}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          {expanded ? 'Mostrar menos' : 'Leer más'}
        </button>
      )}
    </div>
  )
}
