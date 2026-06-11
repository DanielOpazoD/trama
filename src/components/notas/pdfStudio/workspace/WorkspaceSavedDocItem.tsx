import {
  isSavedFilledTemplate,
  type SavedDoc,
  type SavedFolder,
} from '../../../../lib/pdfStudio/render/persistence'
import {
  ArrowRightIcon,
  DownloadIcon,
  FilePdfIcon,
  PencilIcon,
  TrashIcon,
} from '../../../Icons'
import { OverflowMenu, OverflowMenuItem } from '../../../OverflowMenu'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'
const kindChip =
  'inline-flex h-4 items-center rounded px-1.5 text-[9px] font-medium leading-none'
const SAVED_DOC_DRAG_TYPE = 'application/x-trama-saved-doc-id'

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
    <li
      aria-label={saved.name}
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(SAVED_DOC_DRAG_TYPE, saved.id)
      }}
      className="group rounded-md border border-transparent px-1.5 py-1 transition-colors hover:border-ink-100 hover:bg-ink-100/40 active:cursor-grabbing"
    >
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
          <OverflowMenu
            label={`Más acciones de ${saved.name}`}
            width="w-52"
            triggerClassName={`${rowBtn} shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100`}
          >
            {(close) => (
              <>
                <OverflowMenuItem
                  onClick={() => {
                    close()
                    onOpen()
                  }}
                >
                  <FilePdfIcon size={14} />
                  Abrir
                </OverflowMenuItem>
                <OverflowMenuItem
                  onClick={() => {
                    close()
                    onDownload()
                  }}
                >
                  <DownloadIcon size={14} />
                  Descargar
                </OverflowMenuItem>
                <OverflowMenuItem
                  onClick={() => {
                    close()
                    onStartRename()
                  }}
                >
                  <PencilIcon size={14} />
                  Renombrar
                </OverflowMenuItem>
                {folders.length > 0 ? (
                  <>
                    <div className="my-1 border-t border-ink-100" />
                    {saved.folderId ? (
                      <OverflowMenuItem
                        onClick={() => {
                          close()
                          onMoveToFolder(null)
                        }}
                      >
                        <ArrowRightIcon size={14} />
                        Sacar de carpeta
                      </OverflowMenuItem>
                    ) : null}
                    {folders.map((folder) => (
                      <OverflowMenuItem
                        key={folder.id}
                        disabled={saved.folderId === folder.id}
                        onClick={() => {
                          close()
                          onMoveToFolder(folder.id)
                        }}
                      >
                        <ArrowRightIcon size={14} />
                        Mover a {folder.name}
                      </OverflowMenuItem>
                    ))}
                  </>
                ) : null}
                <div className="my-1 border-t border-ink-100" />
                <OverflowMenuItem
                  danger
                  onClick={() => {
                    close()
                    onDelete()
                  }}
                >
                  <TrashIcon size={14} />
                  Eliminar
                </OverflowMenuItem>
              </>
            )}
          </OverflowMenu>
        ) : null}
      </div>
    </li>
  )
}
