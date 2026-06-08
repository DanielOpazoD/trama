import { useEffect, useState } from 'react'
import { isPdfTemplate, type ImageAsset } from '../../../lib/pdfStudio/model'
import { type SavedDoc } from '../../../lib/pdfStudio/persistence'
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FilePdfIcon,
  PlusIcon,
  TrashIcon,
} from '../../Icons'
import { WorkspaceSavedDocsSection } from './WorkspaceSavedDocsSection'
import { WorkspaceTemplatesSection } from './WorkspaceTemplatesSection'

const ACCENT = 'var(--accent-sage)'

const iconBtn =
  'touch-target inline-flex h-5 w-5 items-center justify-center rounded bg-ink-900/65 text-paper-50 hover:bg-ink-900/90 transition-colors'
/** Miniatura de una imagen de la biblioteca (object URL propio, revocado al salir). */
function LibraryThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? (
    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
  ) : (
    <span className="block h-full w-full bg-ink-100/40" />
  )
}

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
  const templates = saved.filter((s) => isPdfTemplate(s.doc))
  const creations = saved.filter((s) => !isPdfTemplate(s.doc))
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
        <CameraIcon size={15} />
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
        <span className="text-caption font-medium text-ink-600">Panel</span>
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
        {/* ── Imágenes ───────────────────────────────────────────────────── */}
        <section>
          <h3 className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1 text-caption font-medium text-ink-600">
            <CameraIcon size={13} />
            Imágenes
            <span className="text-ink-300 tabular-nums">({library.length})</span>
          </h3>
          {library.length === 0 ? (
            <p className="px-2.5 pb-2 text-micro text-ink-400">
              Las imágenes que subas quedan acá para reutilizarlas.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 px-2.5 pb-2.5">
              {library.map((a) => (
                <li
                  key={a.id}
                  className="group relative aspect-square rounded-md overflow-hidden border border-ink-100 bg-ink-100/30"
                >
                  <button
                    type="button"
                    onClick={() => onAddImage(a)}
                    aria-label="Agregar esta imagen al documento"
                    title="Agregar al documento"
                    className="absolute inset-0"
                  >
                    <LibraryThumb file={a.file} />
                  </button>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-0.5 left-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-paper-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <PlusIcon size={12} />
                  </span>
                  <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onDownloadImage(a)}
                      aria-label="Descargar imagen"
                      title="Descargar"
                      className={iconBtn}
                    >
                      <DownloadIcon size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveImage(a.id)}
                      aria-label="Quitar imagen de la lista"
                      title="Quitar de la lista"
                      className={`${iconBtn} hover:!bg-[color:var(--accent-clay)]`}
                    >
                      <TrashIcon size={11} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
