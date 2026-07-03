import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import type { SavedTemplateMetaPatch } from './WorkspaceTemplateDetails'
import type { WorkspaceTemplateCloud } from './useWorkspaceTemplateCloud'

export type WorkspacePanelProps = {
  saved: SavedDoc[]
  folders: SavedFolder[]
  templatesEnabled?: boolean
  canSave: boolean
  canSaveTemplate: boolean
  onSaveCreation: (name: string) => void
  onCreateFolder: (input: { name: string; color: SavedFolderColor }) => void
  onRenameFolder: (id: string, name: string) => void
  onUpdateFolderColor: (id: string, color: SavedFolderColor) => void
  onDeleteFolder: (id: string) => void
  onSaveTemplate: (name: string) => void
  saveTemplateSignal?: number
  suggestedSaveName?: string
  onOpenSaved: (s: SavedDoc) => void
  onUseTemplate: (s: SavedDoc) => void
  onDuplicateSaved: (s: SavedDoc) => void
  onDuplicateAndEditSaved: (s: SavedDoc) => void
  onUpdateSavedMeta: (id: string, meta: SavedTemplateMetaPatch) => void
  onRenameSaved: (id: string, name: string) => void
  onMoveSavedToFolder: (id: string, folderId: string | null) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  onExportTemplatePackage: (s: SavedDoc, format: 'json' | 'csv') => void
  /** Nube de plantillas (historial de versiones); ausente sin sync activo. */
  templateCloud?: WorkspaceTemplateCloud
  collapsed: boolean
  onToggleCollapsed: () => void
}
