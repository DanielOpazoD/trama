import { useState } from 'react'
import {
  savedTemplateStatus,
  type SavedDoc,
  type SavedTemplateStatus,
} from '../../../../lib/pdfStudio/render/persistence'
import { parseTemplateTags } from './workspaceTemplateFilter'

export type SavedTemplateMetaPatch = Partial<
  Pick<SavedDoc, 'description' | 'tags' | 'status'>
>

const inputClass =
  'w-full rounded border border-ink-200 bg-paper-50 px-1.5 py-1 text-micro text-ink-700 placeholder:text-ink-300 outline-none focus:border-[color:var(--accent-sage)]/60'

export function WorkspaceTemplateStatusBadge({
  status,
}: {
  status: SavedTemplateStatus
}) {
  return status === 'draft' ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--accent-clay)]/10 px-1.5 text-micro font-medium text-[color:var(--accent-clay)]">
      Borrador
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--accent-sage-soft)]/70 px-1.5 text-micro font-medium text-[color:var(--accent-sage)]">
      Lista
    </span>
  )
}

/** Detalles de biblioteca del card: descripción y tags visibles, con un editor
 *  inline (descripción, tags separadas por coma, estado borrador/lista). El
 *  editor se monta solo mientras se edita, así cada edición parte fresca. */
export function WorkspaceTemplateDetails({
  saved,
  editing,
  onCloseEdit,
  onUpdateMeta,
}: {
  saved: SavedDoc
  editing: boolean
  onCloseEdit: () => void
  onUpdateMeta: (meta: SavedTemplateMetaPatch) => void
}) {
  if (editing) {
    return (
      <DetailsEditor
        saved={saved}
        onCloseEdit={onCloseEdit}
        onUpdateMeta={onUpdateMeta}
      />
    )
  }
  const hasMeta = Boolean(saved.description) || Boolean(saved.tags?.length)
  if (!hasMeta) return null
  return (
    <div className="mt-1 min-w-0">
      {saved.description ? (
        <p className="truncate text-micro text-ink-500" title={saved.description}>
          {saved.description}
        </p>
      ) : null}
      {saved.tags?.length ? (
        <p className="truncate text-micro text-[color:var(--accent-sage)]">
          {saved.tags.map((tag) => `#${tag}`).join(' ')}
        </p>
      ) : null}
    </div>
  )
}

function DetailsEditor({
  saved,
  onCloseEdit,
  onUpdateMeta,
}: {
  saved: SavedDoc
  onCloseEdit: () => void
  onUpdateMeta: (meta: SavedTemplateMetaPatch) => void
}) {
  const [description, setDescription] = useState(saved.description ?? '')
  const [tagsInput, setTagsInput] = useState((saved.tags ?? []).join(', '))
  const [status, setStatus] = useState<SavedTemplateStatus>(savedTemplateStatus(saved))

  const save = () => {
    onUpdateMeta({
      description: description.trim() || undefined,
      tags: parseTemplateTags(tagsInput),
      status,
    })
    onCloseEdit()
  }

  return (
    <div className="mt-1.5 grid gap-1.5" aria-label={`Detalles de ${saved.name}`}>
      <input
        autoFocus
        type="text"
        aria-label="Descripción de la plantilla"
        placeholder="Descripción breve"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        aria-label="Tags de la plantilla (separadas por coma)"
        placeholder="Tags separadas por coma"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        className={inputClass}
      />
      <div className="flex items-center justify-between gap-1.5">
        <div
          role="group"
          aria-label="Estado de la plantilla"
          className="inline-flex rounded-md bg-ink-100/45 p-0.5"
        >
          {(
            [
              { key: 'draft', label: 'Borrador' },
              { key: 'ready', label: 'Lista' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={status === option.key}
              onClick={() => setStatus(option.key)}
              className={`rounded px-1.5 py-0.5 text-micro font-medium transition-colors ${
                status === option.key
                  ? 'bg-paper-50 text-ink-800 shadow-sm'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onCloseEdit}
            className="btn-ghost inline-flex h-6 items-center px-1.5 text-micro"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            aria-label={`Guardar detalles de ${saved.name}`}
            className="btn-accent inline-flex h-6 items-center px-2 text-micro"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
