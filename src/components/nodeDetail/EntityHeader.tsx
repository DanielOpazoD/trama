import { ENTITY_TYPES, type Entity } from '../../types'
import { CloseIcon, SparkleIcon } from '../Icons'
import { Tooltip } from '../Tooltip'

/**
 * Header del panel de detalle: tipo + año + badge IA + nombre + link
 * a Spotify (si aplica) + botón de cerrar.
 *
 * Solo presentación — no toca estado.
 */
export function EntityHeader({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  return (
    <header
      // viewTransitionName matchea con el EntityRow en lista — el navegador
      // anima del card al header automáticamente cuando se abre el panel.
      // Solo funciona en Chrome 111+/Safari 18+ con la View Transitions API.
      style={{ viewTransitionName: `entity-card-${entity.id}` } as React.CSSProperties}
      // δ2: pad-block-4 = 22px arriba/abajo en vez de 16px (py-4). El
      // nombre de la entidad es el ancla visual del panel, merece
      // respirar.
      className="px-5 pad-block-4 border-b border-ink-100 flex items-start justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider text-ink-400 flex items-center gap-2 flex-wrap">
          <span>{typeLabel ?? entity.type}</span>
          {entity.year !== undefined && (
            <>
              <span className="text-ink-200">·</span>
              <span>{entity.year}</span>
            </>
          )}
          {entity.origin.kind === 'ai' && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: 'var(--accent-gold-soft)',
                color: 'var(--accent-gold)',
              }}
            >
              <SparkleIcon size={10} />
              IA
            </span>
          )}
        </p>
        {/* mt-2 (en vez de mt-1) da media línea más entre el chip de tipo
            y el nombre — la pausa que tiene una portada de libro entre la
            categoría y el título. */}
        <h2 className="font-serif text-2xl text-ink-800 leading-tight mt-2 break-words">
          {entity.name}
        </h2>
        {entity.spotifyUrl && (
          <a
            href={entity.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition-colors"
          >
            ↗ abrir en Spotify
          </a>
        )}
      </div>
      <Tooltip content="Cerrar panel">
        <button
          onClick={onClose}
          className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          aria-label="Cerrar"
        >
          <CloseIcon size={14} />
        </button>
      </Tooltip>
    </header>
  )
}
