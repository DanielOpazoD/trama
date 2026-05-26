import type { ExtractionProposal } from '../../types'

/**
 * G2 (FF3-d) — estado de check por sección del modal de propuesta. Cada
 * sección es un arreglo paralelo con `proposal.<section>`: el bool en
 * `checked.entities[3]` corresponde a `proposal.entities[3]`.
 *
 * Vive en `proposals/utils.tsx` porque lo comparten el panel
 * orquestador y los renderers de sección.
 */
export type CheckedState = {
  entities: boolean[]
  relationships: boolean[]
  quotes: boolean[]
  edits: boolean[]
  /** Deletes default to UNCHECKED — opt-in only. */
  deletes: boolean[]
}

/**
 * Estado inicial: todo marcado salvo los deletes (opt-in por diseño).
 */
export function initialChecked(proposal: ExtractionProposal): CheckedState {
  return {
    entities: proposal.entities.map(() => true),
    relationships: proposal.relationships.map(() => true),
    quotes: proposal.quotes.map(() => true),
    edits: (proposal.edits ?? []).map(() => true),
    deletes: (proposal.deletes ?? []).map(() => false), // opt-in
  }
}

/**
 * Section wrapper editorial — eyebrow small-caps Spectral + lista de
 * filas. Recibe `tone="warn"` para teñir el title con accent-clay
 * (usado en la sección "Eliminar — opt-in").
 *
 * θ6: section-eyebrow-serif (small caps Spectral) en vez del uppercase
 * tracking-wider plano. Más coherente con QuickNoteForm y QuotesList
 * del NodeDetailPanel.
 */
export function Section({
  title,
  children,
  tone,
}: {
  title: string
  children: React.ReactNode
  tone?: 'warn'
}) {
  return (
    <div>
      <h3
        className="section-eyebrow-serif mb-3"
        style={tone === 'warn' ? { color: 'var(--accent-clay)' } : undefined}
      >
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}
