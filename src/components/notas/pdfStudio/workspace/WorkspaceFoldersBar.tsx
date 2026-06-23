import { useState, type DragEvent } from 'react'
import type {
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import {
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../../Icons'
import { IconButton } from '../../../IconButton'
import { OverflowMenu, OverflowMenuItem } from '../../../OverflowMenu'
import { WorkspaceFolderIcon, workspaceFolderColorOptions } from './WorkspaceFolderIcon'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'
const SAVED_DOC_DRAG_TYPE = 'application/x-trama-saved-doc-id'

export function WorkspaceFoldersBar({
  counts,
  draft,
  folders,
  selectedFolderId,
  onCancelDraft,
  onChangeDraft,
  onCreateFolder,
  onDeleteFolder,
  onDropSavedToFolder,
  onRenameFolder,
  onSelectFolder,
  onStartDraft,
  onUpdateFolderColor,
}: {
  counts: Map<string, number>
  draft: { name: string; color: SavedFolderColor } | null
  folders: SavedFolder[]
  selectedFolderId: string | null
  onCancelDraft: () => void
  onChangeDraft: (draft: { name: string; color: SavedFolderColor }) => void
  onCreateFolder: () => void
  onDeleteFolder: (id: string) => void
  onDropSavedToFolder: (savedId: string, folderId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onSelectFolder: (id: string | null) => void
  onStartDraft: () => void
  onUpdateFolderColor: (id: string, color: SavedFolderColor) => void
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

  function acceptDrag(e: DragEvent, folderId: string | null) {
    if (!Array.from(e.dataTransfer.types).includes(SAVED_DOC_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(folderId ?? 'all')
  }

  function dropSaved(e: DragEvent, folderId: string | null) {
    const id = e.dataTransfer.getData(SAVED_DOC_DRAG_TYPE)
    setDropTarget(null)
    if (!id) return
    e.preventDefault()
    onDropSavedToFolder(id, folderId)
  }

  function commitRename() {
    const name = renaming?.value.trim() ?? ''
    if (renaming && name) onRenameFolder(renaming.id, name)
    setRenaming(null)
  }

  return (
    <div className="space-y-1 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectFolder(null)}
          aria-label="Mostrar todas las copias"
          onDragEnter={(e) => acceptDrag(e, null)}
          onDragOver={(e) => acceptDrag(e, null)}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => dropSaved(e, null)}
          data-drop-active={dropTarget === 'all' ? 'true' : undefined}
          className={`rounded-full px-2 py-1 text-micro transition-colors ${
            dropTarget === 'all'
              ? 'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)] ring-1 ring-[color:var(--accent-sage)]'
              : ''
          } ${
            selectedFolderId === null
              ? 'bg-ink-100 text-ink-700'
              : 'text-ink-400 hover:bg-ink-100/60 hover:text-ink-700'
          }`}
        >
          Todas
          <span className="ml-1 tabular-nums text-ink-300">{counts.get('all') ?? 0}</span>
        </button>
        {draft === null && (
          <button
            type="button"
            onClick={onStartDraft}
            className="btn-ghost inline-flex items-center gap-1 text-micro"
          >
            <PlusIcon size={11} /> Nueva carpeta
          </button>
        )}
      </div>

      {folders.length > 0 && (
        <div className="flex flex-col gap-1" aria-label="Carpetas de PDFs y copias">
          {folders.map((folder) => {
            const isDropActive = dropTarget === folder.id
            const isRenaming = renaming?.id === folder.id
            return (
              <div
                key={folder.id}
                className={`group flex items-center rounded-md transition-colors ${
                  selectedFolderId === folder.id
                    ? 'bg-ink-100/70 text-ink-800'
                    : 'text-ink-500 hover:bg-ink-100/50 hover:text-ink-800'
                } ${
                  isDropActive
                    ? 'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)] ring-1 ring-[color:var(--accent-sage)]'
                    : ''
                }`}
              >
                {isRenaming ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1 p-1">
                    <WorkspaceFolderIcon color={folder.color} size={22} />
                    <input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) =>
                        setRenaming({ id: folder.id, value: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        else if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={commitRename}
                      aria-label={`Nombre de la carpeta ${folder.name}`}
                      placeholder="Nombre de la carpeta"
                      className="input-paper min-w-0 flex-1 rounded border border-ink-200 px-1.5 py-0.5 text-caption"
                    />
                    <IconButton
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={commitRename}
                      label="Guardar nombre de carpeta"
                      className={rowBtn}
                    >
                      <CheckIcon size={13} />
                    </IconButton>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectFolder(selectedFolderId === folder.id ? null : folder.id)
                      }
                      aria-label={`Abrir carpeta ${folder.name}`}
                      aria-expanded={selectedFolderId === folder.id}
                      onDragEnter={(e) => acceptDrag(e, folder.id)}
                      onDragOver={(e) => acceptDrag(e, folder.id)}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => dropSaved(e, folder.id)}
                      data-drop-active={isDropActive ? 'true' : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left"
                    >
                      <ChevronDownIcon
                        size={11}
                        className={`shrink-0 text-ink-300 transition-transform ${
                          selectedFolderId === folder.id ? '' : '-rotate-90'
                        }`}
                      />
                      <WorkspaceFolderIcon color={folder.color} size={24} />
                      <span className="min-w-0 flex-1 truncate text-caption">
                        {folder.name}
                      </span>
                      <span className="text-micro tabular-nums text-ink-300">
                        {counts.get(folder.id) ?? 0}
                      </span>
                    </button>
                    <OverflowMenu
                      label={`Más acciones de carpeta ${folder.name}`}
                      width="w-52"
                      triggerClassName={`${rowBtn} mr-1 opacity-0 group-hover:opacity-100 focus:opacity-100`}
                    >
                      {(close) => (
                        <>
                          <OverflowMenuItem
                            onClick={() => {
                              close()
                              setRenaming({ id: folder.id, value: folder.name })
                            }}
                          >
                            <PencilIcon size={14} />
                            Renombrar
                          </OverflowMenuItem>
                          <div className="my-1 border-t border-ink-100" />
                          {workspaceFolderColorOptions.map((option) => (
                            <OverflowMenuItem
                              key={option.value}
                              onClick={() => {
                                close()
                                onUpdateFolderColor(folder.id, option.value)
                              }}
                            >
                              <WorkspaceFolderIcon color={option.value} size={16} />
                              Cambiar a {option.label}
                            </OverflowMenuItem>
                          ))}
                          <div className="my-1 border-t border-ink-100" />
                          <OverflowMenuItem
                            danger
                            onClick={() => {
                              close()
                              onDeleteFolder(folder.id)
                            }}
                          >
                            <TrashIcon size={14} />
                            Eliminar carpeta
                          </OverflowMenuItem>
                        </>
                      )}
                    </OverflowMenu>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {draft && (
        <div className="rounded-md border border-ink-100 bg-paper-50/75 p-1.5">
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => onChangeDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateFolder()
              else if (e.key === 'Escape') onCancelDraft()
            }}
            aria-label="Nombre de la carpeta nueva"
            placeholder="Nombre de la carpeta"
            className="input-paper w-full rounded border border-ink-200 px-2 py-1 text-caption"
          />
          <div className="mt-1.5 flex items-center justify-between gap-1">
            <div className="flex gap-1" aria-label="Colores de carpeta">
              {workspaceFolderColorOptions.map((option) => (
                <IconButton
                  key={option.value}
                  label={`Color ${option.label}`}
                  onClick={() => onChangeDraft({ ...draft, color: option.value })}
                  className={`grid h-6 w-6 place-items-center rounded border transition-colors ${
                    draft.color === option.value
                      ? 'border-ink-500 bg-ink-50'
                      : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  <WorkspaceFolderIcon color={option.value} size={18} />
                </IconButton>
              ))}
            </div>
            <div className="flex gap-1">
              <IconButton
                onClick={onCreateFolder}
                label="Crear carpeta"
                className={rowBtn}
              >
                <CheckIcon size={14} />
              </IconButton>
              <IconButton
                onClick={onCancelDraft}
                label="Cancelar carpeta"
                className={rowBtn}
              >
                <CloseIcon size={14} />
              </IconButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
