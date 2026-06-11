import { useRef, useState } from 'react'
import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import { CheckIcon, CloseIcon, FilePdfIcon, PlusIcon } from '../../../Icons'
import { WorkspaceFoldersBar } from './WorkspaceFoldersBar'
import { WorkspaceSavedDocItem } from './WorkspaceSavedDocItem'

const ACCENT = 'var(--accent-sage)'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

export function WorkspaceSavedDocsSection({
  creations,
  canSave,
  folders,
  suggestedName,
  onCreateFolder,
  onSaveCreation,
  onOpenSaved,
  onRenameSaved,
  onDeleteSaved,
  onDownloadSaved,
  onMoveSavedToFolder,
}: {
  creations: SavedDoc[]
  canSave: boolean
  folders: SavedFolder[]
  /** Prefill del nombre al guardar (el título del documento, si lo tiene). */
  suggestedName?: string
  onCreateFolder: (input: { name: string; color: SavedFolderColor }) => void
  onSaveCreation: (name: string) => void
  onOpenSaved: (s: SavedDoc) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  onMoveSavedToFolder: (id: string, folderId: string | null) => void
}) {
  const [newName, setNewName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [folderDraft, setFolderDraft] = useState<{
    name: string
    color: SavedFolderColor
  } | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
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
  const folderCounts = new Map<string, number>()
  folderCounts.set('all', creations.length)
  for (const folder of folders) folderCounts.set(folder.id, 0)
  for (const item of creations) {
    if (item.folderId)
      folderCounts.set(item.folderId, (folderCounts.get(item.folderId) ?? 0) + 1)
  }
  const visibleCreations = selectedFolderId
    ? creations.filter((s) => s.folderId === selectedFolderId)
    : creations

  const confirmFolder = () => {
    const name = folderDraft?.name.trim() ?? ''
    if (!folderDraft || !name) return
    onCreateFolder({ name, color: folderDraft.color })
    setFolderDraft(null)
  }

  return (
    <section className="pb-2">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-0.5">
        <h3 className="section-eyebrow-serif flex items-center gap-1.5 text-ink-400">
          <FilePdfIcon size={12} />
          PDFs y copias
          <span className="text-ink-300 tabular-nums">({creations.length})</span>
        </h3>
        {newName === null && (
          <button
            type="button"
            onClick={() => setNewName(suggestedName ?? '')}
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

      <WorkspaceFoldersBar
        counts={folderCounts}
        draft={folderDraft}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onCancelDraft={() => setFolderDraft(null)}
        onChangeDraft={setFolderDraft}
        onCreateFolder={confirmFolder}
        onSelectFolder={setSelectedFolderId}
        onStartDraft={() => setFolderDraft({ name: '', color: 'blue' })}
      />

      {visibleCreations.length === 0 ? (
        <p className="px-2.5 text-micro text-ink-400">
          {creations.length === 0
            ? 'Guarda PDFs y copias para reabrirlas.'
            : 'Esa carpeta todavía está vacía.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 px-2 pt-1">
          {visibleCreations.map((s) => (
            <WorkspaceSavedDocItem
              key={s.id}
              saved={s}
              folders={folders}
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
              onMoveToFolder={(folderId) => onMoveSavedToFolder(s.id, folderId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
