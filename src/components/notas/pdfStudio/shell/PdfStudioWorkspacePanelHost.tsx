import type { ImageAsset } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { WorkspacePanel } from '../workspace/WorkspacePanel'

export function PdfStudioWorkspacePanelHost({
  canSave,
  canSaveTemplate,
  collapsed,
  library,
  saved,
  show,
  templatesEnabled,
  onAddImage,
  onDeleteSaved,
  onDownloadImage,
  onDownloadSaved,
  onDuplicateSaved,
  onExportTemplatePackage,
  onOpenSaved,
  onRemoveImage,
  onRenameSaved,
  onSaveCreation,
  onSaveTemplate,
  saveTemplateSignal,
  onToggleCollapsed,
  onUseTemplate,
}: {
  canSave: boolean
  canSaveTemplate: boolean
  collapsed: boolean
  library: ImageAsset[]
  saved: SavedDoc[]
  show: boolean
  templatesEnabled?: boolean
  onAddImage: (asset: ImageAsset) => void
  onDeleteSaved: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
  onDownloadSaved: (saved: SavedDoc) => void
  onDuplicateSaved: (saved: SavedDoc) => void
  onExportTemplatePackage: (saved: SavedDoc, format: 'json' | 'csv') => void
  onOpenSaved: (saved: SavedDoc) => void
  onRemoveImage: (id: string) => void
  onRenameSaved: (id: string, name: string) => void
  onSaveCreation: (name: string) => void
  onSaveTemplate: (name: string) => void
  saveTemplateSignal?: number
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
          templatesEnabled={templatesEnabled}
          canSave={canSave}
          canSaveTemplate={canSaveTemplate}
          onSaveCreation={onSaveCreation}
          onSaveTemplate={onSaveTemplate}
          saveTemplateSignal={saveTemplateSignal}
          onOpenSaved={onOpenSaved}
          onUseTemplate={onUseTemplate}
          onDuplicateSaved={onDuplicateSaved}
          onRenameSaved={onRenameSaved}
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
