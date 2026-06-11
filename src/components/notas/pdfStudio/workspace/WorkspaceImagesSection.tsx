import { useEffect, useState } from 'react'
import type { ImageAsset } from '../../../../lib/pdfStudio/model/model'
import { CameraIcon, ChevronDownIcon, PlusIcon } from '../../../Icons'
import { WorkspaceImageActions } from './WorkspaceImageActions'

const ACCENT = 'var(--accent-sage)'

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
  onEditImage,
}: {
  library: ImageAsset[]
  onAddImage: (asset: ImageAsset) => void
  onRemoveImage: (id: string) => void
  onDownloadImage: (asset: ImageAsset) => void
  onEditImage: (asset: ImageAsset) => void
}) {
  // Colapsada por defecto: la galería de miniaturas empujaba "PDFs y copias" fuera de vista.
  const [collapsed, setCollapsed] = useState(true)

  return (
    <section>
      <h3>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="section-eyebrow-serif flex w-full items-center gap-1.5 px-2.5 pt-2 pb-0.5 text-ink-400 transition-colors hover:text-ink-700"
        >
          <CameraIcon size={12} />
          Imágenes
          <span className="text-ink-300 tabular-nums">({library.length})</span>
          <ChevronDownIcon
            size={12}
            className={`ml-auto text-ink-300 transition-transform duration-200 ease-out-quart ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
      </h3>
      {collapsed ? null : library.length === 0 ? (
        <p className="px-2.5 pb-2 text-micro text-ink-400">
          Tus imágenes para reutilizar.
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
              <WorkspaceImageActions
                asset={a}
                onDownloadImage={onDownloadImage}
                onEditImage={onEditImage}
                onRemoveImage={onRemoveImage}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
