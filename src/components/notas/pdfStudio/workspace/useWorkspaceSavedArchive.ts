import { useState } from 'react'
import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import type { WorkspaceArchiveSort } from './WorkspaceArchiveControls'

export function useWorkspaceSavedArchive({
  creations,
  folders,
  onCreateFolder,
  onDeleteFolder,
  onMoveSavedToFolder,
}: {
  creations: SavedDoc[]
  folders: SavedFolder[]
  onCreateFolder: (input: { name: string; color: SavedFolderColor }) => void
  onDeleteFolder: (id: string) => void
  onMoveSavedToFolder: (id: string, folderId: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<WorkspaceArchiveSort>('recent')
  const [moveNotice, setMoveNotice] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState<{
    name: string
    color: SavedFolderColor
  } | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const folderCounts = countFolders(creations, folders)
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null
  const selectedFolderCreations = selectedFolderId
    ? creations.filter((s) => s.folderId === selectedFolderId)
    : creations
  const latestSavedAt =
    selectedFolderCreations.length > 0
      ? Math.max(...selectedFolderCreations.map((s) => s.savedAt))
      : null
  const normalizedQuery = query.trim().toLowerCase()
  const visibleCreations = sortSavedDocs(
    normalizedQuery
      ? selectedFolderCreations.filter((s) =>
          s.name.toLowerCase().includes(normalizedQuery),
        )
      : selectedFolderCreations,
    sort,
  )

  const confirmFolder = () => {
    const name = folderDraft?.name.trim() ?? ''
    if (!folderDraft || !name) return
    onCreateFolder({ name, color: folderDraft.color })
    setFolderDraft(null)
  }
  const deleteFolder = (id: string) => {
    if (selectedFolderId === id) setSelectedFolderId(null)
    onDeleteFolder(id)
  }
  const moveSaved = (id: string, folderId: string | null) => {
    onMoveSavedToFolder(id, folderId)
    const folderName = folders.find((folder) => folder.id === folderId)?.name ?? 'Todas'
    setMoveNotice(`Movido a ${folderName}`)
  }

  return {
    confirmFolder,
    deleteFolder,
    folderCounts,
    folderDraft,
    latestSavedAt,
    moveNotice,
    moveSaved,
    query,
    selectedFolder,
    selectedFolderCreations,
    selectedFolderId,
    setFolderDraft,
    setQuery,
    setSelectedFolderId,
    setSort,
    sort,
    visibleCreations,
  }
}

function countFolders(
  creations: SavedDoc[],
  folders: SavedFolder[],
): Map<string, number> {
  const counts = new Map<string, number>()
  counts.set('all', creations.length)
  for (const folder of folders) counts.set(folder.id, 0)
  for (const item of creations) {
    if (item.folderId) counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1)
  }
  return counts
}

function sortSavedDocs(list: SavedDoc[], sort: WorkspaceArchiveSort): SavedDoc[] {
  return [...list].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'es')
    if (sort === 'type') return (a.kind ?? '').localeCompare(b.kind ?? '', 'es')
    return b.savedAt - a.savedAt
  })
}
