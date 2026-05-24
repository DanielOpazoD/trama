import { useState } from 'react'
import { EntitiesView } from './EntitiesView'
import { RelationshipsView } from './RelationshipsView'
import type { ExtractionProposal } from '../types'

/**
 * ο1: Wrapper de Entidades con tabs internas "Listado" / "Vínculos".
 *
 * Antes Relaciones vivía como sección top-level del sidebar. Conceptualmente
 * eso mentía sobre la dependencia: una relación NUNCA existe sola — siempre
 * conecta entidades. Cuando vas a "Relaciones" lo primero que hacés es
 * elegir entidades de ambos extremos.
 *
 * Esta vista resuelve eso unificándolas bajo "Entidades":
 *   - Listado: la vista tradicional de entidades con sus chips de tipo
 *   - Vínculos: la gestión de relaciones (la antigua RelationshipsView)
 *
 * El Grafo (vista separada) sigue siendo donde EXPLORÁS visualmente. Acá
 * GESTIONÁS los nodos y aristas.
 *
 * El tab activo se mantiene como state interno — al volver a la sección,
 * arranca en Listado por default. Si más adelante queremos deep-linking
 * (?tab=vinculos), elevamos el state al App y persistimos en URL.
 */
export function EntitiesWorkbench({
  onSelectEntity,
  onProposal,
  initialTab,
}: {
  onSelectEntity?: (id: string) => void
  onProposal?: (text: string, proposal: ExtractionProposal) => void
  /** Tab inicial al montar. Útil para deep-links desde CommandPalette. */
  initialTab?: 'listado' | 'vinculos'
}) {
  const [tab, setTab] = useState<'listado' | 'vinculos'>(initialTab ?? 'listado')

  return (
    <>
      <header className="mb-6">
        <h2 className="font-serif text-4xl text-ink-700 leading-none">Entidades</h2>
        <div className="accent-rule mt-3 mb-2" />
        <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-xl">
          {tab === 'listado'
            ? 'Las cosas que conectas: personas, libros, canciones, álbumes, películas, obras, conceptos, ideas. Cada nodo del grafo es una entidad.'
            : 'Vínculos entre dos entidades — quién influye en quién, qué cita a qué, qué te llegó por dónde. Las líneas del grafo.'}
        </p>
      </header>

      {/* Tab strip — visual: dos pestañas con la activa subrayada en
          accent-primary, la inactiva en ink-300. Patrón coherente con el
          resto del proyecto (no usamos el patrón "shadow box" de los toggle
          de filtros porque acá la jerarquía es mayor). */}
      <div
        className="mb-8 flex items-center gap-8 border-b border-ink-100/60"
        role="tablist"
        aria-label="Sub-secciones de Entidades"
      >
        <TabButton
          label="Listado"
          active={tab === 'listado'}
          onClick={() => setTab('listado')}
        />
        <TabButton
          label="Vínculos"
          active={tab === 'vinculos'}
          onClick={() => setTab('vinculos')}
        />
      </div>

      {/* Body — renderizamos ambos siempre montados podría mantener cache
          de scroll, pero costaría doble fetch sin necesidad. Renderizamos
          solo el activo; cuando el usuario cambia, las queries del otro
          se mantienen en cache TanStack así que el switch es instantáneo. */}
      {tab === 'listado' && <EntitiesView onSelectEntity={onSelectEntity} />}
      {tab === 'vinculos' && (
        <RelationshipsView onSelectEntity={onSelectEntity} onProposal={onProposal} />
      )}
    </>
  )
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative pb-3 text-sm transition-colors ${
        active
          ? 'text-ink-800 font-medium'
          : 'text-ink-400 hover:text-ink-700'
      }`}
    >
      {label}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 right-0 -bottom-px h-[2px] rounded-t"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        />
      )}
    </button>
  )
}
