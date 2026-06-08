import { useEffect, useState } from 'react'
import type { ImageAsset } from '../../../lib/pdfStudio/model/model'
import { CameraIcon, DownloadIcon, PlusIcon, TrashIcon } from '../../Icons'

const ACCENT = 'var(--accent-sage)'

const iconBtn =
  'touch-target inline-flex h-5 w-5 items-center justify-center rounded bg-ink-900/65 text-paper-50 hover:bg-ink-900/90 transition-colors'

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

export function WorkspaceImagesSection({
  library,
  onAddImage,
  onRemoveImage,
  onDownloadImage,
}: {
  library: ImageAsset[]
  onAddImage: (asset: ImageAsset) => void
  onRemoveImage: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
}) {
  return (
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
  )
}
