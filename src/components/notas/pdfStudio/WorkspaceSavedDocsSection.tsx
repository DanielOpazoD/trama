import { useRef, useState } from 'react'
import type { SavedDoc } from '../../../lib/pdfStudio/persistence'
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  FilePdfIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../Icons'

const ACCENT = 'var(--accent-sage)'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

function dateLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function WorkspaceSavedDocsSection({
  creations,
  canSave,
  onSaveCreation,
  onOpenSaved,
  onRenameSaved,
  onDeleteSaved,
  onDownloadSaved,
}: {
  creations: SavedDoc[]
  canSave: boolean
  onSaveCreation: (name: string) => void
  onOpenSaved: (s: SavedDoc) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
}) {
  const [newName, setNewName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const skipBlurConfirmRef = useRef(false)

  const confirmNew = () => {
    const name = (newName ?? '').trim()
    if (name) onSaveCreation(name)
    setNewName(null)
  }

  const confirmRename = () => {
    if (renaming) {
      const name = renaming.value.trim()
      if (name) onRenameSaved(renaming.id, name)
    }
    setRenaming(null)
  }

  return (
    <section className="pb-2">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-1">
        <h3 className="flex items-center gap-1.5 text-caption font-medium text-ink-600">
          <FilePdfIcon size={13} />
          PDFs y copias
          <span className="text-ink-300 tabular-nums">({creations.length})</span>
        </h3>
        {newName === null && (
          <button
            type="button"
            onClick={() => setNewName('')}
            disabled={!canSave}
            title={
              canSave
                ? 'Guardar la creación actual con un nombre'
                : 'Agrega hojas para poder guardar'
            }
            className="btn-ghost text-micro inline-flex items-center gap-1 disabled:opacity-40"
          >
            <PlusIcon size={11} /> Guardar
          </button>
        )}
      </div>

      {newName !== null && (
        <div className="flex items-center gap-1 px-2.5 pb-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmNew()
              else if (e.key === 'Escape') setNewName(null)
            }}
            placeholder="Nombre de la creación"
            className="input-paper flex-1 min-w-0 text-caption px-2 py-1 rounded-md border border-ink-200"
          />
          <button
            type="button"
            onClick={confirmNew}
            aria-label="Guardar"
            title="Guardar"
            className={rowBtn}
            style={{ color: ACCENT }}
          >
            <CheckIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setNewName(null)}
            aria-label="Cancelar"
            title="Cancelar"
            className={rowBtn}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {creations.length === 0 ? (
        <p className="px-2.5 text-micro text-ink-400">
          Guarda PDFs sueltos o copias rellenadas para volver a abrirlas.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 px-2 pt-1">
          {creations.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ink-100/40 transition-colors"
            >
              {renaming?.id === s.id ? (
                <input
                  autoFocus
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: s.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename()
                    else if (e.key === 'Escape') {
                      skipBlurConfirmRef.current = true
                      setRenaming(null)
                    }
                  }}
                  onBlur={() => {
                    if (skipBlurConfirmRef.current) {
                      skipBlurConfirmRef.current = false
                      return
                    }
                    confirmRename()
                  }}
                  className="input-paper flex-1 min-w-0 text-caption px-1.5 py-0.5 rounded border border-ink-200"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenSaved(s)}
                  aria-label={`Abrir ${s.name} para editar`}
                  title="Abrir para editar"
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block truncate text-caption text-ink-700">
                    {s.name}
                  </span>
                  <span className="block text-micro text-ink-400 tabular-nums">
                    {s.doc.pages.length} {s.doc.pages.length === 1 ? 'hoja' : 'hojas'} ·{' '}
                    {dateLabel(s.savedAt)}
                  </span>
                </button>
              )}
              {renaming?.id !== s.id && (
                <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onDownloadSaved(s)}
                    aria-label={`Descargar ${s.name}`}
                    title="Descargar"
                    className={rowBtn}
                  >
                    <DownloadIcon size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming({ id: s.id, value: s.name })}
                    aria-label={`Renombrar ${s.name}`}
                    title="Renombrar"
                    className={rowBtn}
                  >
                    <PencilIcon size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSaved(s.id)}
                    aria-label={`Eliminar ${s.name}`}
                    title="Eliminar de la lista"
                    className={`${rowBtn} hover:!text-[color:var(--accent-clay)]`}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
