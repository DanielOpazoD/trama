import { useEffect, useState } from 'react'
import { type ImageAsset } from '../../../lib/pdfStudio/model'
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PlusIcon,
  TrashIcon,
} from '../../Icons'

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
 * Panel lateral con la BIBLIOTECA de imágenes subidas (workspace reutilizable,
 * aparte de la grilla). Cada imagen se puede **agregar al documento** (clic),
 * **descargar** o **quitar de la lista**. Colapsable: en su forma minimizada es
 * un riel finito con el conteo. Presentacional: el estado vive en `PdfStudioView`.
 */
export function ImageLibraryPanel({
  library,
  collapsed,
  onToggleCollapsed,
  onAddToDoc,
  onRemove,
  onDownload,
}: {
  library: ImageAsset[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onAddToDoc: (asset: ImageAsset) => void
  onRemove: (id: string) => void
  onDownload: (asset: ImageAsset) => void
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label="Mostrar la biblioteca de imágenes"
        title="Mostrar imágenes"
        className="shrink-0 self-stretch flex flex-col items-center gap-2 rounded-lg border border-ink-100 bg-paper-50 px-1.5 py-3 text-ink-400 hover:text-ink-700 hover:border-ink-200 transition-colors"
      >
        <ChevronLeftIcon size={14} />
        <CameraIcon size={15} />
        <span className="text-micro tabular-nums" style={{ color: ACCENT }}>
          {library.length}
        </span>
      </button>
    )
  }

  return (
    <aside className="w-56 shrink-0 rounded-lg border border-ink-100 bg-paper-50 flex flex-col self-stretch overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-ink-100/70">
        <span className="inline-flex items-center gap-1.5 text-caption font-medium text-ink-600">
          <CameraIcon size={13} />
          Imágenes
          <span className="text-ink-300 tabular-nums">({library.length})</span>
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Ocultar la biblioteca de imágenes"
          title="Ocultar"
          className="touch-target p-1 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors shrink-0"
        >
          <ChevronRightIcon size={14} />
        </button>
      </header>

      {library.length === 0 ? (
        <p className="p-3 text-caption text-ink-400">
          Las imágenes que subas quedan acá para reutilizarlas: tocá una para agregarla al
          documento.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 p-2.5 overflow-auto">
          {library.map((a) => (
            <li
              key={a.id}
              className="group relative aspect-square rounded-md overflow-hidden border border-ink-100 bg-ink-100/30"
            >
              <button
                type="button"
                onClick={() => onAddToDoc(a)}
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
                  onClick={() => onDownload(a)}
                  aria-label="Descargar imagen"
                  title="Descargar"
                  className={iconBtn}
                >
                  <DownloadIcon size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
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
    </aside>
  )
}
