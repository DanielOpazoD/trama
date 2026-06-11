import type { ImageAsset } from '../../../../lib/pdfStudio/model/model'
import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'

export type WorkspacePanelProps = {
  library: ImageAsset[]
  onAddImage: (asset: ImageAsset) => void
  onRemoveImage: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
  onEditImage: (asset: ImageAsset) => void
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
  onRenameSaved: (id: string, name: string) => void
  onMoveSavedToFolder: (id: string, folderId: string | null) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  onExportTemplatePackage: (s: SavedDoc, format: 'json' | 'csv') => void
  collapsed: boolean
  onToggleCollapsed: () => void
}
