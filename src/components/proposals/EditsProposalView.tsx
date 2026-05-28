import type { ProposedDelete, ProposedEdit } from '../../types'
import { Section } from './utils'

/**
 * G2 (FF3-d) — secciones destructivas de la propuesta IA: Cambios
 * (edits) y Eliminar (deletes, opt-in). Extraído de
 * `ProposalPanel.tsx` para que el panel orquestador quede más
 * delgado.
 *
 * Edits arrancan tildados (es lo que la IA recomienda aplicar); los
 * deletes arrancan UN-tildados — el usuario tiene que confirmar
 * explícitamente cada borrado. Esa asimetría vive en
 * `utils.initialChecked`.
 *
 * Cada sección se auto-oculta si su array está vacío.
 */
export function EditsProposalView({
  edits,
  deletes,
  checkedEdits,
  checkedDeletes,
  onToggleEdit,
  onToggleDelete,
}: {
  edits: ProposedEdit[]
  deletes: ProposedDelete[]
  checkedEdits: boolean[]
  checkedDeletes: boolean[]
  onToggleEdit: (index: number) => void
  onToggleDelete: (index: number) => void
}) {
  return (
    <>
      {edits.length > 0 && (
        <Section title="Cambios">
          {edits.map((edit, index) => (
            <ProposedEditRow
              key={index}
              edit={edit}
              checked={checkedEdits[index] ?? false}
              onToggle={() => onToggleEdit(index)}
            />
          ))}
        </Section>
      )}

      {deletes.length > 0 && (
        <Section title="Eliminar — opt-in" tone="warn">
          {deletes.map((del, index) => (
            <ProposedDeleteRow
              key={index}
              del={del}
              checked={checkedDeletes[index] ?? false}
              onToggle={() => onToggleDelete(index)}
            />
          ))}
        </Section>
      )}
    </>
  )
}

function ProposedEditRow({
  edit,
  checked,
  onToggle,
}: {
  edit: ProposedEdit
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-start gap-3 p-3 bg-paper-100/50 border border-ink-100 rounded-lg">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-ink-600"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--accent-primary)' }}
          >
            editar{' '}
            {edit.kind === 'entity'
              ? 'entidad'
              : edit.kind === 'quote'
                ? 'cita'
                : 'relación'}
          </span>
          <span className="text-ink-700">
            {edit.kind === 'entity' ? edit.name : edit.preview}
          </span>
        </div>
        <div className="mt-1 text-xs text-ink-500 space-y-0.5">
          {Object.entries(edit.patch).map(([k, v]) => (
            <div key={k}>
              <span className="text-ink-300">{k}:</span>{' '}
              <span className="text-ink-600">{v === null ? '—' : String(v)}</span>
            </div>
          ))}
        </div>
        {edit.reason && <p className="mt-1 text-xs text-ink-400 italic">{edit.reason}</p>}
      </div>
    </li>
  )
}

function ProposedDeleteRow({
  del,
  checked,
  onToggle,
}: {
  del: ProposedDelete
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li
      className="flex items-start gap-3 p-3 border rounded-lg"
      style={{
        borderColor: 'var(--accent-clay)',
        backgroundColor: 'rgb(162 82 57 / 0.04)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1"
        style={{ accentColor: 'var(--accent-clay)' }}
      />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-baseline gap-2">
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--accent-clay)' }}
          >
            borrar{' '}
            {del.kind === 'entity'
              ? 'entidad'
              : del.kind === 'quote'
                ? 'cita'
                : 'relación'}
          </span>
          <span className="text-ink-700">{del.preview}</span>
        </div>
        {del.reason && <p className="mt-1 text-xs text-ink-400 italic">{del.reason}</p>}
      </div>
    </li>
  )
}
