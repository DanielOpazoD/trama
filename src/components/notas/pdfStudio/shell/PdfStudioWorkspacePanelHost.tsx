import type { ImageAsset } from '../../../../lib/pdfStudio/model/model'
import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import { WorkspacePanel } from '../workspace/WorkspacePanel'

export function PdfStudioWorkspacePanelHost({
  canSave,
  canSaveTemplate,
  collapsed,
  library,
  folders,
  saved,
  show,
  templatesEnabled,
  onAddImage,
  onDeleteSaved,
  onDownloadImage,
  onDownloadSaved,
  onCreateFolder,
  onDeleteFolder,
  onDuplicateSaved,
  onExportTemplatePackage,
  onOpenSaved,
  onRemoveImage,
  onRenameFolder,
  onRenameSaved,
  onMoveSavedToFolder,
  onSaveCreation,
  onSaveTemplate,
  saveTemplateSignal,
  suggestedSaveName,
  onUpdateFolderColor,
  onToggleCollapsed,
  onUseTemplate,
}: {
  canSave: boolean
  canSaveTemplate: boolean
  collapsed: boolean
  library: ImageAsset[]
  folders: SavedFolder[]
  saved: SavedDoc[]
  show: boolean
  templatesEnabled?: boolean
  onAddImage: (asset: ImageAsset) => void
  onDeleteSaved: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
  onDownloadSaved: (saved: SavedDoc) => void
  onCreateFolder: (input: { name: string; color: SavedFolderColor }) => void
  onDeleteFolder: (id: string) => void
  onDuplicateSaved: (saved: SavedDoc) => void
  onExportTemplatePackage: (saved: SavedDoc, format: 'json' | 'csv') => void
  onOpenSaved: (saved: SavedDoc) => void
  onRemoveImage: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
  onRenameSaved: (id: string, name: string) => void
  onMoveSavedToFolder: (id: string, folderId: string | null) => void
  onSaveCreation: (name: string) => void
  onSaveTemplate: (name: string) => void
  saveTemplateSignal?: number
  /** Nombre sugerido al guardar una creación (el título del documento). */
  suggestedSaveName?: string
  onUpdateFolderColor: (id: string, color: SavedFolderColor) => void
  onToggleCollapsed: () => void
  onUseTemplate: (saved: SavedDoc) => void
}) {
  if (!show) return null

  return (
    <>
      {!collapsed && (
        <button
          type="button"
          aria-label="Cerrar el panel"
          onClick={onToggleCollapsed}
          className="fixed inset-0 z-30 bg-ink-900/40 md:hidden"
        />
      )}
      <div
        className={`shrink-0 self-stretch ${
          collapsed
            ? ''
            : 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl'
        }`}
      >
        <WorkspacePanel
          library={library}
          onAddImage={onAddImage}
          onRemoveImage={onRemoveImage}
          onDownloadImage={onDownloadImage}
          saved={saved}
          folders={folders}
          templatesEnabled={templatesEnabled}
          canSave={canSave}
          canSaveTemplate={canSaveTemplate}
          onSaveCreation={onSaveCreation}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onUpdateFolderColor={onUpdateFolderColor}
          onDeleteFolder={onDeleteFolder}
          onSaveTemplate={onSaveTemplate}
          saveTemplateSignal={saveTemplateSignal}
          suggestedSaveName={suggestedSaveName}
          onOpenSaved={onOpenSaved}
          onUseTemplate={onUseTemplate}
          onDuplicateSaved={onDuplicateSaved}
          onRenameSaved={onRenameSaved}
          onMoveSavedToFolder={onMoveSavedToFolder}
          onDeleteSaved={onDeleteSaved}
          onDownloadSaved={onDownloadSaved}
          onExportTemplatePackage={onExportTemplatePackage}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </div>
    </>
  )
}
