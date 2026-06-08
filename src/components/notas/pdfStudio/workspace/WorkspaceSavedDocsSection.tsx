import { useRef, useState } from 'react'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { CheckIcon, CloseIcon, FilePdfIcon, PlusIcon } from '../../../Icons'
import { WorkspaceSavedDocItem } from './WorkspaceSavedDocItem'

const ACCENT = 'var(--accent-sage)'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

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
            className={rowBtn}
            style={{ color: ACCENT }}
          >
            <CheckIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setNewName(null)}
            aria-label="Cancelar"
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
            <WorkspaceSavedDocItem
              key={s.id}
              saved={s}
              isRenaming={renaming?.id === s.id}
              renameValue={renaming?.id === s.id ? renaming.value : ''}
              onRenameValueChange={(value) => setRenaming({ id: s.id, value })}
              onConfirmRename={confirmRename}
              onCancelRename={() => {
                skipBlurConfirmRef.current = true
                setRenaming(null)
              }}
              onRenameBlur={() => {
                if (skipBlurConfirmRef.current) {
                  skipBlurConfirmRef.current = false
                  return
                }
                confirmRename()
              }}
              onOpen={() => onOpenSaved(s)}
              onDownload={() => onDownloadSaved(s)}
              onStartRename={() => setRenaming({ id: s.id, value: s.name })}
              onDelete={() => onDeleteSaved(s.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
