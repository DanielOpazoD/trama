import { useEffect, useState } from 'react'
import { isPdfTemplate, type ImageAsset, type PdfDoc } from '../../../lib/pdfStudio/model'
import { type SavedDoc } from '../../../lib/pdfStudio/persistence'
import {
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  FilePdfIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../Icons'

const ACCENT = 'var(--accent-sage)'

const iconBtn =
  'touch-target inline-flex h-5 w-5 items-center justify-center rounded bg-ink-900/65 text-paper-50 hover:bg-ink-900/90 transition-colors'
const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

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

/** Fecha corta local (día/mes hh:mm) para los guardados. */
function dateLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Panel lateral del workspace con DOS secciones: **Imágenes** (biblioteca de
 * imágenes subidas, reutilizables → agregar al documento / descargar / quitar) y
 * **Guardados** (creaciones con nombre que perduran → re-abrir para editar,
 * descargar, renombrar, eliminar). Colapsable a un riel finito. Presentacional: el
 * estado y las mutaciones viven en `PdfStudioView`.
 */
export function WorkspacePanel({
  library,
  onAddImage,
  onRemoveImage,
  onDownloadImage,
  saved,
  canSave,
  canSaveTemplate,
  onSaveCreation,
  onSaveTemplate,
  onOpenSaved,
  onUseTemplate,
  onRenameSaved,
  onDeleteSaved,
  onDownloadSaved,
  collapsed,
  onToggleCollapsed,
}: {
  library: ImageAsset[]
  onAddImage: (asset: ImageAsset) => void
  onRemoveImage: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
  saved: SavedDoc[]
  /** Hay algo (hojas) para guardar como creación. */
  canSave: boolean
  canSaveTemplate: boolean
  onSaveCreation: (name: string) => void
  onSaveTemplate: (name: string) => void
  onOpenSaved: (s: SavedDoc) => void
  onUseTemplate: (s: SavedDoc) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  // Formulario inline para nombrar una creación nueva (null = cerrado).
  const [newName, setNewName] = useState<string | null>(null)
  const [newTemplateName, setNewTemplateName] = useState<string | null>(null)
  // Renombrado inline de un guardado (id en edición + valor).
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

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
          {saved.length}
        </span>
      </button>
    )
  }

  const confirmNew = () => {
    const name = (newName ?? '').trim()
    if (name) onSaveCreation(name)
    setNewName(null)
  }
  const confirmNewTemplate = () => {
    const name = (newTemplateName ?? '').trim()
    if (name) onSaveTemplate(name)
    setNewTemplateName(null)
  }
  const confirmRename = () => {
    if (renaming) {
      const name = renaming.value.trim()
      if (name) onRenameSaved(renaming.id, name)
    }
    setRenaming(null)
  }
  const templates = saved.filter((s) => isPdfTemplate(s.doc))
  const creations = saved.filter((s) => !isPdfTemplate(s.doc))

  const fieldCount = (doc: PdfDoc) => doc.formFields?.length ?? 0
  const fieldCountLabel = (doc: PdfDoc) => {
    const count = fieldCount(doc)
    return `${count} ${count === 1 ? 'campo' : 'campos'}`
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

        {/* ── Planillas ──────────────────────────────────────────────────── */}
        <section className="pb-2">
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-1">
            <h3 className="flex items-center gap-1.5 text-caption font-medium text-ink-600">
              <FilePdfIcon size={13} />
              Planillas
              <span className="text-ink-300 tabular-nums">({templates.length})</span>
            </h3>
            {newTemplateName === null && (
              <button
                type="button"
                aria-label="Guardar planilla"
                onClick={() => setNewTemplateName('')}
                disabled={!canSaveTemplate}
                title={
                  canSaveTemplate
                    ? 'Guardar la creación actual como planilla reusable'
                    : 'Agrega campos especiales para poder guardar una planilla'
                }
                className="btn-ghost text-micro inline-flex items-center gap-1 disabled:opacity-40"
              >
                <PlusIcon size={11} /> Planilla
              </button>
            )}
          </div>

          {newTemplateName !== null && (
            <div className="flex items-center gap-1 px-2.5 pb-2">
              <input
                autoFocus
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmNewTemplate()
                  else if (e.key === 'Escape') setNewTemplateName(null)
                }}
                placeholder="Nombre de la planilla"
                className="input-paper flex-1 min-w-0 text-caption px-2 py-1 rounded-md border border-ink-200"
              />
              <button
                type="button"
                onClick={confirmNewTemplate}
                aria-label="Guardar planilla"
                title="Guardar planilla"
                className={rowBtn}
                style={{ color: ACCENT }}
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setNewTemplateName(null)}
                aria-label="Cancelar"
                title="Cancelar"
                className={rowBtn}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {templates.length === 0 ? (
            <p className="px-2.5 text-micro text-ink-400">
              Diseña casilleros especiales y guarda la planilla para rellenarla después.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 px-2 pt-1">
              {templates.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ink-100/40 transition-colors"
                >
                  {renaming?.id === s.id ? (
                    <input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ id: s.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRename()
                        else if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={confirmRename}
                      className="input-paper flex-1 min-w-0 text-caption px-1.5 py-0.5 rounded border border-ink-200"
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onUseTemplate(s)}
                        aria-label={`Usar planilla ${s.name}`}
                        title="Abrir limpia para rellenar e imprimir"
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="block truncate text-caption text-ink-700">
                          {s.name}
                        </span>
                        <span className="block text-micro text-ink-400 tabular-nums">
                          {fieldCountLabel(s.doc)} · {s.doc.pages.length}{' '}
                          {s.doc.pages.length === 1 ? 'hoja' : 'hojas'} ·{' '}
                          {dateLabel(s.savedAt)}
                        </span>
                      </button>
                      <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onDownloadSaved(s)}
                          aria-label={`Descargar ${s.name}`}
                          title="Descargar"
                          className={rowBtn}
                        >
                          <DownloadIcon size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming({ id: s.id, value: s.name })}
                          aria-label={`Renombrar ${s.name}`}
                          title="Renombrar"
                          className={rowBtn}
                        >
                          <PencilIcon size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSaved(s.id)}
                          aria-label={`Eliminar ${s.name}`}
                          title="Eliminar de la lista"
                          className={`${rowBtn} hover:!text-[color:var(--accent-clay)]`}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mx-2.5 border-t border-ink-100/70" />

        {/* ── Guardados ──────────────────────────────────────────────────── */}
        <section className="pb-2">
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-1">
            <h3 className="flex items-center gap-1.5 text-caption font-medium text-ink-600">
              <FilePdfIcon size={13} />
              Guardados
              <span className="text-ink-300 tabular-nums">({creations.length})</span>
            </h3>
            {newName === null && (
              <button
                type="button"
                onClick={() => setNewName('')}
                disabled={!canSave}
                title={
                  canSave
                    ? 'Guardar la creación actual con un nombre'
                    : 'Agrega hojas para poder guardar'
                }
                className="btn-ghost text-micro inline-flex items-center gap-1 disabled:opacity-40"
              >
                <PlusIcon size={11} /> Guardar
              </button>
            )}
          </div>

          {newName !== null && (
            <div className="flex items-center gap-1 px-2.5 pb-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmNew()
                  else if (e.key === 'Escape') setNewName(null)
                }}
                placeholder="Nombre de la creación"
                className="input-paper flex-1 min-w-0 text-caption px-2 py-1 rounded-md border border-ink-200"
              />
              <button
                type="button"
                onClick={confirmNew}
                aria-label="Guardar"
                title="Guardar"
                className={rowBtn}
                style={{ color: ACCENT }}
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setNewName(null)}
                aria-label="Cancelar"
                title="Cancelar"
                className={rowBtn}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {creations.length === 0 ? (
            <p className="px-2.5 text-micro text-ink-400">
              Guarda tus creaciones con un nombre para volver a abrirlas y editarlas.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 px-2 pt-1">
              {creations.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ink-100/40 transition-colors"
                >
                  {renaming?.id === s.id ? (
                    <input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ id: s.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRename()
                        else if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={confirmRename}
                      className="input-paper flex-1 min-w-0 text-caption px-1.5 py-0.5 rounded border border-ink-200"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenSaved(s)}
                      aria-label={`Abrir ${s.name} para editar`}
                      title="Abrir para editar"
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="block truncate text-caption text-ink-700">
                        {s.name}
                      </span>
                      <span className="block text-micro text-ink-400 tabular-nums">
                        {s.doc.pages.length} {s.doc.pages.length === 1 ? 'hoja' : 'hojas'}{' '}
                        · {dateLabel(s.savedAt)}
                      </span>
                    </button>
                  )}
                  {renaming?.id !== s.id && (
                    <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onDownloadSaved(s)}
                        aria-label={`Descargar ${s.name}`}
                        title="Descargar"
                        className={rowBtn}
                      >
                        <DownloadIcon size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: s.id, value: s.name })}
                        aria-label={`Renombrar ${s.name}`}
                        title="Renombrar"
                        className={rowBtn}
                      >
                        <PencilIcon size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSaved(s.id)}
                        aria-label={`Eliminar ${s.name}`}
                        title="Eliminar de la lista"
                        className={`${rowBtn} hover:!text-[color:var(--accent-clay)]`}
                      >
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}
