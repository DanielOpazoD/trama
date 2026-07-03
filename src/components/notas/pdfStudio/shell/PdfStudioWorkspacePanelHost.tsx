import type {
  SavedDoc,
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import type { SavedTemplateMetaPatch } from '../workspace/WorkspaceTemplateDetails'
import type { WorkspaceTemplateCloud } from '../workspace/useWorkspaceTemplateCloud'
import { WorkspacePanel } from '../workspace/WorkspacePanel'

export function PdfStudioWorkspacePanelHost({
  canSave,
  canSaveTemplate,
  collapsed,
  folders,
  saved,
  show,
  templatesEnabled,
  onDeleteSaved,
  onDownloadSaved,
  onCreateFolder,
  onDeleteFolder,
  onDuplicateSaved,
  onDuplicateAndEditSaved,
  onUpdateSavedMeta,
  onExportTemplatePackage,
  onOpenSaved,
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
  templateCloud,
}: {
  canSave: boolean
  canSaveTemplate: boolean
  collapsed: boolean
  folders: SavedFolder[]
  saved: SavedDoc[]
  show: boolean
  templatesEnabled?: boolean
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (saved: SavedDoc) => void
  onCreateFolder: (input: { name: string; color: SavedFolderColor }) => void
  onDeleteFolder: (id: string) => void
  onDuplicateSaved: (saved: SavedDoc) => void
  onDuplicateAndEditSaved: (saved: SavedDoc) => void
  onUpdateSavedMeta: (id: string, meta: SavedTemplateMetaPatch) => void
  onExportTemplatePackage: (saved: SavedDoc, format: 'json' | 'csv') => void
  onOpenSaved: (saved: SavedDoc) => void
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
  templateCloud?: WorkspaceTemplateCloud
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
          onDuplicateAndEditSaved={onDuplicateAndEditSaved}
          onUpdateSavedMeta={onUpdateSavedMeta}
          onRenameSaved={onRenameSaved}
          onMoveSavedToFolder={onMoveSavedToFolder}
          onDeleteSaved={onDeleteSaved}
          onDownloadSaved={onDownloadSaved}
          onExportTemplatePackage={onExportTemplatePackage}
          templateCloud={templateCloud}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </div>
    </>
  )
}
