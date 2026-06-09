import { type ImageAsset } from '../../../../lib/pdfStudio/model/model'
import {
  isSavedTemplate,
  type SavedDoc,
} from '../../../../lib/pdfStudio/render/persistence'
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilePdfIcon,
} from '../../../Icons'
import { WorkspaceImagesSection } from './WorkspaceImagesSection'
import { WorkspaceSavedDocsSection } from './WorkspaceSavedDocsSection'
import { WorkspaceTemplatesSection } from './WorkspaceTemplatesSection'

const ACCENT = 'var(--accent-sage)'

/**
 * Panel lateral del workspace con imágenes, planillas reutilizables y creaciones
 * sueltas. Colapsable a un riel finito. Presentacional: el estado y las mutaciones
 * viven en `PdfStudioView`.
 */
export function WorkspacePanel({
  library,
  onAddImage,
  onRemoveImage,
  onDownloadImage,
  saved,
  templatesEnabled = true,
  canSave,
  canSaveTemplate,
  onSaveCreation,
  onSaveTemplate,
  saveTemplateSignal = 0,
  suggestedSaveName,
  onOpenSaved,
  onUseTemplate,
  onDuplicateSaved,
  onRenameSaved,
  onDeleteSaved,
  onDownloadSaved,
  onExportTemplatePackage,
  collapsed,
  onToggleCollapsed,
}: {
  library: ImageAsset[]
  onAddImage: (asset: ImageAsset) => void
  onRemoveImage: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
  saved: SavedDoc[]
  templatesEnabled?: boolean
  /** Hay algo (hojas) para guardar como creación. */
  canSave: boolean
  canSaveTemplate: boolean
  onSaveCreation: (name: string) => void
  onSaveTemplate: (name: string) => void
  saveTemplateSignal?: number
  /** Nombre sugerido al guardar una creación (el título del documento). */
  suggestedSaveName?: string
  onOpenSaved: (s: SavedDoc) => void
  onUseTemplate: (s: SavedDoc) => void
  onDuplicateSaved: (s: SavedDoc) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  onExportTemplatePackage: (s: SavedDoc, format: 'json' | 'csv') => void
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const templates = saved.filter(isSavedTemplate)
  const creations = saved.filter((s) => !isSavedTemplate(s))
  const savedCount = templatesEnabled ? saved.length : creations.length

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label="Mostrar el panel de imágenes y guardados"
        title="Mostrar panel"
        className="surface-sidebar flex h-full w-full flex-col items-center gap-2 border-r border-ink-100 px-1.5 py-3 text-ink-400 hover:bg-ink-100/30 hover:text-ink-700 transition-colors"
      >
        <ChevronRightIcon size={14} />
        <CameraIcon size={14} />
        <span className="text-micro tabular-nums" style={{ color: ACCENT }}>
          {library.length}
        </span>
        <FilePdfIcon size={14} />
        <span className="text-micro tabular-nums" style={{ color: ACCENT }}>
          {savedCount}
        </span>
      </button>
    )
  }

  return (
    <aside className="surface-sidebar flex h-full w-60 flex-col overflow-hidden border-r border-ink-100">
      <header className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-ink-100/70 shrink-0">
        <span className="section-eyebrow-serif" style={{ color: ACCENT }}>
          mesa de trabajo
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Ocultar el panel"
          title="Ocultar"
          className="touch-target p-1 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors shrink-0"
        >
          <ChevronLeftIcon size={14} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        <WorkspaceImagesSection
          library={library}
          onAddImage={onAddImage}
          onRemoveImage={onRemoveImage}
          onDownloadImage={onDownloadImage}
        />

        <div className="mx-2.5 border-t border-ink-100/70" />

        {templatesEnabled && (
          <>
            <WorkspaceTemplatesSection
              templates={templates}
              canSaveTemplate={canSaveTemplate}
              saveTemplateSignal={saveTemplateSignal}
              onSaveTemplate={onSaveTemplate}
              onOpenSaved={onOpenSaved}
              onUseTemplate={onUseTemplate}
              onDuplicateSaved={onDuplicateSaved}
              onRenameSaved={onRenameSaved}
              onDeleteSaved={onDeleteSaved}
              onDownloadSaved={onDownloadSaved}
              onExportTemplatePackage={onExportTemplatePackage}
            />

            <div className="mx-2.5 border-t border-ink-100/70" />
          </>
        )}

        <WorkspaceSavedDocsSection
          creations={creations}
          canSave={canSave}
          suggestedName={suggestedSaveName}
          onSaveCreation={onSaveCreation}
          onOpenSaved={onOpenSaved}
          onRenameSaved={onRenameSaved}
          onDeleteSaved={onDeleteSaved}
          onDownloadSaved={onDownloadSaved}
        />
      </div>
    </aside>
  )
}
