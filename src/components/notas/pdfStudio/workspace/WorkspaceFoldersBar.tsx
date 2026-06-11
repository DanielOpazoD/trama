import type {
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import { CheckIcon, CloseIcon, PlusIcon } from '../../../Icons'
import { WorkspaceFolderIcon, workspaceFolderColorOptions } from './WorkspaceFolderIcon'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

export function WorkspaceFoldersBar({
  counts,
  draft,
  folders,
  selectedFolderId,
  onCancelDraft,
  onChangeDraft,
  onCreateFolder,
  onSelectFolder,
  onStartDraft,
}: {
  counts: Map<string, number>
  draft: { name: string; color: SavedFolderColor } | null
  folders: SavedFolder[]
  selectedFolderId: string | null
  onCancelDraft: () => void
  onChangeDraft: (draft: { name: string; color: SavedFolderColor }) => void
  onCreateFolder: () => void
  onSelectFolder: (id: string | null) => void
  onStartDraft: () => void
}) {
  return (
    <div className="space-y-1 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectFolder(null)}
          aria-label="Mostrar todas las copias"
          className={`rounded-full px-2 py-1 text-micro transition-colors ${
            selectedFolderId === null
              ? 'bg-ink-100 text-ink-700'
              : 'text-ink-400 hover:bg-ink-100/60 hover:text-ink-700'
          }`}
        >
          Todas
          <span className="ml-1 tabular-nums text-ink-300">{counts.get('all') ?? 0}</span>
        </button>
        {draft === null && (
          <button
            type="button"
            onClick={onStartDraft}
            className="btn-ghost inline-flex items-center gap-1 text-micro"
          >
            <PlusIcon size={11} /> Nueva carpeta
          </button>
        )}
      </div>

      {folders.length > 0 && (
        <div className="flex flex-col gap-1" aria-label="Carpetas de PDFs y copias">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelectFolder(folder.id)}
              aria-label={`Abrir carpeta ${folder.name}`}
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${
                selectedFolderId === folder.id
                  ? 'bg-ink-100/70 text-ink-800'
                  : 'text-ink-500 hover:bg-ink-100/50 hover:text-ink-800'
              }`}
            >
              <WorkspaceFolderIcon color={folder.color} size={24} />
              <span className="min-w-0 flex-1 truncate text-caption">{folder.name}</span>
              <span className="text-micro tabular-nums text-ink-300">
                {counts.get(folder.id) ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {draft && (
        <div className="rounded-md border border-ink-100 bg-paper-50/75 p-1.5">
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => onChangeDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateFolder()
              else if (e.key === 'Escape') onCancelDraft()
            }}
            placeholder="Nombre de la carpeta"
            className="input-paper w-full rounded border border-ink-200 px-2 py-1 text-caption"
          />
          <div className="mt-1.5 flex items-center justify-between gap-1">
            <div className="flex gap-1" aria-label="Colores de carpeta">
              {workspaceFolderColorOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={`Color ${option.label}`}
                  onClick={() => onChangeDraft({ ...draft, color: option.value })}
                  className={`grid h-6 w-6 place-items-center rounded border transition-colors ${
                    draft.color === option.value
                      ? 'border-ink-500 bg-ink-50'
                      : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  <WorkspaceFolderIcon color={option.value} size={18} />
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onCreateFolder}
                aria-label="Crear carpeta"
                className={rowBtn}
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={onCancelDraft}
                aria-label="Cancelar carpeta"
                className={rowBtn}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
