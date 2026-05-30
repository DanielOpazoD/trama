import { ENTITY_TYPES, type Entity } from '../../types'
import { CloseIcon, SparkleIcon } from '../Icons'
import { Tooltip } from '../Tooltip'
import { EntitySigil } from '../EntitySigil'
import { EntityActionsMenu } from './EntityActionsMenu'

/**
 * Header del panel de detalle: tipo + año + badge IA + nombre + links externos
 * (Spotify, Wikipedia, Grokipedia) + menú de acciones + cerrar.
 */
export function EntityHeader({
  entity,
  onClose,
  onOpenThread,
  onEditDescription,
  editingDescription = false,
}: {
  entity: Entity
  onClose: () => void
  onOpenThread?: (threadId: string) => void
  onEditDescription?: () => void
  editingDescription?: boolean
}) {
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  return (
    <header
      style={{ viewTransitionName: `entity-card-${entity.id}` } as React.CSSProperties}
      className="px-6 pad-block-5 border-b border-ink-100 flex items-start justify-between gap-3"
    >
      <EntitySigil name={entity.name} type={entity.type} size="lg" className="mt-1" />
      <div className="min-w-0 flex-1 stack-2">
        <p className="section-eyebrow flex items-center gap-2 flex-wrap">
          <span>{typeLabel ?? entity.type}</span>
          {entity.year !== undefined && (
            <>
              <span className="text-ink-200">·</span>
              <span className="tabular-nums">{entity.year}</span>
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

        <h2 className="font-serif text-xl text-ink-800 leading-[1.2] tracking-tight break-words flex items-center gap-2">
          {entity.name}

          {entity.grokipediaUrl && (
            <a
              href={entity.grokipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-0.5 rounded bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors font-medium"
              title="Abrir en Grokipedia"
            >
              Grokipedia ⇗
            </a>
          )}
        </h2>

        {!editingDescription &&
          (entity.description ? (
            <p
              onDoubleClick={onEditDescription}
              className="text-sm text-ink-600 leading-relaxed cursor-text select-text"
              title="Doble clic para editar"
            >
              {entity.description}
            </p>
          ) : (
            <p
              onDoubleClick={onEditDescription}
              className="text-ink-300 italic text-sm cursor-text"
              title="Doble clic para añadir descripción"
            >
              sin descripción.
            </p>
          ))}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {entity.spotifyUrl && (
            <a
              href={entity.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition-colors"
            >
              ⇗ abrir en Spotify
            </a>
          )}
          {entity.wikipediaUrl && (
            <a
              href={entity.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700 transition-colors"
            >
              ⇗ Wikipedia
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <EntityActionsMenu
          entity={entity}
          onOpenThread={onOpenThread}
          onEditDescription={onEditDescription}
          onClose={onClose}
        />
        <Tooltip content="Cerrar panel">
          <button
            onClick={onClose}
            className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
            aria-label="Cerrar"
          >
            <CloseIcon size={14} />
          </button>
        </Tooltip>
      </div>
    </header>
  )
}
