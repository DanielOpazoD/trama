import { AISourceTag } from '../AISourceTag'
import { ChevronDownIcon, TrashIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { formatRelative } from '../settings/_shared'
import type { XCronica } from '../../api/x'

/**
 * Crónica IA de los bookmarks (se guarda y aparece también en Inicio).
 *
 * Vive aparte de TwitterView porque son dos cosas distintas: un ensayo
 * generado y una lista filtrable. Juntas, el fichero pasaba su ratchet
 * estructural — y la regla del repo es extraer, no subir el umbral.
 */
export function XCronicaCard({
  cronica,
  open,
  onToggle,
  onGenerate,
  onDelete,
  generating,
  deleting,
}: {
  cronica: XCronica | null | undefined
  open: boolean
  onToggle: () => void
  onGenerate: () => void
  onDelete: () => void
  generating: boolean
  deleting: boolean
}) {
  const c = cronica
  return (
    <div className="card-paper mb-6 p-4">
      <div className="flex items-baseline justify-between gap-3">
        {c ? (
          <button
            type="button"
            onClick={() => onToggle()}
            aria-expanded={open}
            className="flex items-baseline gap-1.5 hover:opacity-80 transition-opacity"
            title={open ? 'Ocultar la crónica' : 'Mostrar la crónica'}
          >
            <span className="section-eyebrow-serif">Crónica de tus bookmarks</span>
            <ChevronDownIcon
              size={12}
              className={`text-ink-300 transition-transform ${open ? '' : '-rotate-90'}`}
            />
          </button>
        ) : (
          <span className="section-eyebrow-serif">Crónica de tus bookmarks</span>
        )}
        <div className="flex items-center gap-3 shrink-0">
          {c && <AISourceTag provider={c.provider} model={c.model} at={c.generatedAt} />}
          {/* Regenerar y eliminar viven DENTRO del cuerpo abierto:
                  con la crónica plegada eran dos controles operando
                  sobre algo que no se ve. Sin crónica, «Generar» es la
                  única acción y sí se queda. */}
          {!c && (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
            >
              {generating ? 'escribiendo…' : 'Generar'}
            </button>
          )}
        </div>
      </div>
      {c ? (
        open && (
          <div className="mt-2 animate-fade-up">
            <p className="whitespace-pre-wrap font-serif text-body leading-relaxed text-ink-700">
              {c.text}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-micro text-ink-300 tabular-nums">
                {formatRelative(c.generatedAt)} · {c.sourceCount} bookmarks
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onGenerate}
                  disabled={generating}
                  className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
                >
                  {generating ? 'escribiendo…' : 'Regenerar'}
                </button>
                <IconButton
                  onClick={onDelete}
                  disabled={deleting}
                  label="Eliminar crónica"
                  title="Eliminar la crónica (puedes generar otra cuando quieras)"
                  className="rounded p-1 text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors disabled:opacity-50"
                >
                  <TrashIcon size={12} />
                </IconButton>
              </div>
            </div>
          </div>
        )
      ) : (
        <p className="mt-1 text-sm text-ink-400 italic">
          Un ensayo breve, escrito por la IA, sobre qué guardas en X.
        </p>
      )}
    </div>
  )
}
