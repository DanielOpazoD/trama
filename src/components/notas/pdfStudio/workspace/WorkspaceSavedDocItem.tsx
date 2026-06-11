import {
  isSavedFilledTemplate,
  type SavedDoc,
  type SavedFolder,
} from '../../../../lib/pdfStudio/render/persistence'
import { DownloadIcon, PencilIcon, TrashIcon } from '../../../Icons'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'
const kindChip =
  'inline-flex h-4 items-center rounded px-1.5 text-[9px] font-medium leading-none'

function dateLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function savedDocActionLabel(saved: SavedDoc): string {
  return isSavedFilledTemplate(saved)
    ? `Abrir copia con datos ${saved.name}`
    : `Abrir ${saved.name} para editar`
}

function savedDocSubtitle(saved: SavedDoc): string {
  const pages = `${saved.doc.pages.length} ${saved.doc.pages.length === 1 ? 'hoja' : 'hojas'}`
  return isSavedFilledTemplate(saved)
    ? `copia con datos · ${pages} · ${dateLabel(saved.savedAt)}`
    : `${pages} · ${dateLabel(saved.savedAt)}`
}

function SavedDocKindChip({ saved }: { saved: SavedDoc }) {
  const filled = isSavedFilledTemplate(saved)
  return (
    <span
      className={`${kindChip} mb-1 ${
        filled
          ? 'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'
          : 'bg-ink-100 text-ink-500'
      }`}
    >
      {filled ? 'Copia con datos' : 'PDF'}
    </span>
  )
}

export function WorkspaceSavedDocItem({
  saved,
  folders,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
  onRenameBlur,
  onOpen,
  onDownload,
  onStartRename,
  onDelete,
  onMoveToFolder,
}: {
  saved: SavedDoc
  folders: SavedFolder[]
  isRenaming: boolean
  renameValue: string
  onRenameValueChange: (value: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onRenameBlur: () => void
  onOpen: () => void
  onDownload: () => void
  onStartRename: () => void
  onDelete: () => void
  onMoveToFolder: (folderId: string | null) => void
}) {
  return (
    <li className="group rounded-md px-1.5 py-1 transition-colors hover:bg-ink-100/40">
      <div className="flex items-center gap-1">
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmRename()
              else if (e.key === 'Escape') onCancelRename()
            }}
            onBlur={onRenameBlur}
            className="input-paper flex-1 min-w-0 rounded border border-ink-200 px-1.5 py-0.5 text-caption"
          />
        ) : (
          <button
            type="button"
            onClick={onOpen}
            aria-label={savedDocActionLabel(saved)}
            className="flex-1 min-w-0 text-left"
          >
            <SavedDocKindChip saved={saved} />
            <span className="block truncate text-caption text-ink-700">{saved.name}</span>
            <span className="block text-micro tabular-nums text-ink-400">
              {savedDocSubtitle(saved)}
            </span>
            {isSavedFilledTemplate(saved) ? (
              <span className="mt-0.5 block text-micro font-medium text-[color:var(--accent-sage)]">
                Abrir relleno
              </span>
            ) : null}
          </button>
        )}
        {!isRenaming ? (
          <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={onDownload}
              aria-label={`Descargar ${saved.name}`}
              className={rowBtn}
            >
              <DownloadIcon size={12} />
            </button>
            <button
              type="button"
              onClick={onStartRename}
              aria-label={`Renombrar ${saved.name}`}
              className={rowBtn}
            >
              <PencilIcon size={12} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Eliminar ${saved.name}`}
              className={`${rowBtn} hover:!text-[color:var(--accent-clay)]`}
            >
              <TrashIcon size={12} />
            </button>
          </div>
        ) : null}
      </div>
      {!isRenaming && folders.length > 0 ? (
        <select
          aria-label={`Mover ${saved.name} a carpeta`}
          value={saved.folderId ?? ''}
          onChange={(e) => onMoveToFolder(e.target.value || null)}
          className="mt-1 w-full rounded border border-ink-100 bg-paper-50 px-1.5 py-0.5 text-micro text-ink-500 outline-none transition-colors hover:border-ink-200 focus:border-ink-300"
        >
          <option value="">Sin carpeta</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  )
}
