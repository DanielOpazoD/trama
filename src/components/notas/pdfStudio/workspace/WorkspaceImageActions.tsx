import type { ImageAsset } from '../../../../lib/pdfStudio/model/model'
import { CropIcon, DownloadIcon, TrashIcon } from '../../../Icons'

const iconBtn =
  'touch-target inline-flex h-5 w-5 items-center justify-center rounded bg-ink-900/65 text-paper-50 hover:bg-ink-900/90 transition-colors'

export function WorkspaceImageActions({
  asset,
  onDownloadImage,
  onEditImage,
  onRemoveImage,
}: {
  asset: ImageAsset
  onDownloadImage: (asset: ImageAsset) => void
  onEditImage: (asset: ImageAsset) => void
  onRemoveImage: (id: string) => void
}) {
  return (
    <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={() => onEditImage(asset)}
        aria-label="Editar imagen"
        title="Editar / recortar"
        className={iconBtn}
      >
        <CropIcon size={11} />
      </button>
      <button
        type="button"
        onClick={() => onDownloadImage(asset)}
        aria-label="Descargar imagen"
        title="Descargar"
        className={iconBtn}
      >
        <DownloadIcon size={11} />
      </button>
      <button
        type="button"
        onClick={() => onRemoveImage(asset.id)}
        aria-label="Quitar imagen de la lista"
        title="Quitar de la lista"
        className={`${iconBtn} hover:!bg-[color:var(--accent-clay)]`}
      >
        <TrashIcon size={11} />
      </button>
    </div>
  )
}
