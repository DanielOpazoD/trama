import { ENTITY_TYPES, type Entity } from '../../types'
import { CloseIcon, SparkleIcon } from '../Icons'
import { Tooltip } from '../Tooltip'
import { EntitySigil } from '../EntitySigil'
import { EntityActionsMenu } from './EntityActionsMenu'

/**
 * Header del panel de detalle: tipo + año + badge IA + nombre + link
 * a Spotify (si aplica), un menú ⋯ con las acciones secundarias (hablar /
 * eliminar) y el botón de cerrar.
 *
 * Solo presentación — delega las mutaciones al menú de acciones.
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
  /** Abre el editor de descripción (vive en el body del panel). */
  onEditDescription?: () => void
  /** Mientras se edita, ocultamos el display para no duplicar el texto. */
  editingDescription?: boolean
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
      // θ1: header reorganizado en jerarquía editorial:
      //   - eyebrow (tipo · año · IA badge) arriba en small caps style
      //   - nombre serif grande con drop-tight leading
      //   - link Spotify si aplica
      // Padding horizontal ampliado a px-6 ahora que el panel mide 520px.
      className="px-6 pad-block-5 border-b border-ink-100 flex items-start justify-between gap-3"
    >
      {/* μ2: sigilo grande al lado del nombre. Da identidad visual al
          panel ANTES de leer el nombre. typeAccent en el border-l del
          sigilo refuerza el chip de tipo de abajo. */}
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
        {/* Nombre serif text-h1 (32px) con leading apretado para que un
            nombre largo entre en una o dos líneas elegantes. */}
        <h2 className="font-serif text-xl text-ink-800 leading-[1.2] tracking-tight break-words">
          {entity.name}
        </h2>
        {/* Descripción inmediatamente debajo del título — el editor se
            dispara desde el menú ⋯ o con doble-clic. Mientras se edita, el
            form vive en el body, así que acá ocultamos el display. */}
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
        {entity.spotifyUrl && (
          <a
            href={entity.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition-colors"
          >
            ↗ abrir en Spotify
          </a>
        )}
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
