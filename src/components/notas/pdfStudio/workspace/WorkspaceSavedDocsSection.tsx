import { useRef, useState } from 'react'
import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import {
  WorkspaceArchiveControls,
  WorkspaceArchiveFolderHeader,
} from './WorkspaceArchiveControls'
import { WorkspaceFoldersBar } from './WorkspaceFoldersBar'
import { WorkspaceSaveCreationRow } from './WorkspaceSaveCreationRow'
import { WorkspaceSavedDocsHeader } from './WorkspaceSavedDocsHeader'
import { WorkspaceSavedDocItem } from './WorkspaceSavedDocItem'
import { useWorkspaceSavedArchive } from './useWorkspaceSavedArchive'

export function WorkspaceSavedDocsSection({
  creations,
  canSave,
  folders,
  suggestedName,
  onCreateFolder,
  onRenameFolder,
  onUpdateFolderColor,
  onDeleteFolder,
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
  suggestedName?: string
  onCreateFolder: (input: { name: string; color: SavedFolderColor }) => void
  onRenameFolder: (id: string, name: string) => void
  onUpdateFolderColor: (id: string, color: SavedFolderColor) => void
  onDeleteFolder: (id: string) => void
  onSaveCreation: (name: string) => void
  onOpenSaved: (s: SavedDoc) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  onMoveSavedToFolder: (id: string, folderId: string | null) => void
}) {
  const [newName, setNewName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const archive = useWorkspaceSavedArchive({
    creations,
    folders,
    onCreateFolder,
    onDeleteFolder,
    onMoveSavedToFolder,
  })
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
      <WorkspaceSavedDocsHeader
        canSave={canSave}
        count={creations.length}
        onStartSave={newName === null ? () => setNewName(suggestedName ?? '') : undefined}
      />

      {newName !== null && (
        <WorkspaceSaveCreationRow
          name={newName}
          onCancel={() => setNewName(null)}
          onChangeName={setNewName}
          onConfirm={confirmNew}
        />
      )}

      <WorkspaceFoldersBar
        counts={archive.folderCounts}
        draft={archive.folderDraft}
        folders={folders}
        selectedFolderId={archive.selectedFolderId}
        onCancelDraft={() => archive.setFolderDraft(null)}
        onChangeDraft={archive.setFolderDraft}
        onCreateFolder={archive.confirmFolder}
        onRenameFolder={onRenameFolder}
        onUpdateFolderColor={onUpdateFolderColor}
        onDeleteFolder={archive.deleteFolder}
        onDropSavedToFolder={archive.moveSaved}
        onSelectFolder={archive.setSelectedFolderId}
        onStartDraft={() => archive.setFolderDraft({ name: '', color: 'blue' })}
      />

      {archive.selectedFolder ? (
        <WorkspaceArchiveFolderHeader
          count={archive.selectedFolderCreations.length}
          folder={archive.selectedFolder}
          latestSavedAt={archive.latestSavedAt}
        />
      ) : null}

      {creations.length > 0 ? (
        <WorkspaceArchiveControls
          query={archive.query}
          sort={archive.sort}
          onQueryChange={archive.setQuery}
          onSortChange={archive.setSort}
        />
      ) : null}

      {archive.moveNotice ? (
        <p
          role="status"
          className="px-2.5 pt-1 text-micro text-[color:var(--accent-sage)]"
        >
          {archive.moveNotice}
        </p>
      ) : null}

      {archive.visibleCreations.length === 0 ? (
        <p className="px-2.5 text-micro text-ink-400">
          {creations.length === 0
            ? 'Guarda PDFs y copias para reabrirlas.'
            : 'Esa carpeta todavía está vacía.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 px-2 pt-1">
          {archive.visibleCreations.map((s) => (
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
              onMoveToFolder={(folderId) => archive.moveSaved(s.id, folderId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
