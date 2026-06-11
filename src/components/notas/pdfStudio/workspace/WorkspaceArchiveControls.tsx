import type {
  SavedFolder,
  SavedFolderColor,
} from '../../../../lib/pdfStudio/render/persistence'
import { WorkspaceFolderIcon } from './WorkspaceFolderIcon'

export type WorkspaceArchiveSort = 'recent' | 'name' | 'type'

function dateLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'documento' : 'documentos'}`
}

export function WorkspaceArchiveFolderHeader({
  count,
  folder,
  latestSavedAt,
}: {
  count: number
  folder: SavedFolder
  latestSavedAt: number | null
}) {
  return (
    <div
      role="group"
      aria-label={`Carpeta ${folder.name}`}
      className="mx-2 mt-1 rounded-md border border-ink-100 bg-paper-50/80 px-2 py-1.5"
    >
      <div className="flex items-center gap-2">
        <WorkspaceFolderIcon color={folder.color} size={26} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-caption font-medium text-ink-700">{folder.name}</p>
          <p className="text-micro text-ink-400">
            {countLabel(count)} · Última actualización{' '}
            {latestSavedAt ? dateLabel(latestSavedAt) : 'sin documentos'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function WorkspaceArchiveControls({
  query,
  sort,
  onQueryChange,
  onSortChange,
}: {
  query: string
  sort: WorkspaceArchiveSort
  onQueryChange: (value: string) => void
  onSortChange: (value: WorkspaceArchiveSort) => void
}) {
  return (
    <div className="mx-2 mt-1 grid grid-cols-[1fr_auto] gap-1.5">
      <input
        type="search"
        aria-label="Buscar PDFs y copias"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar..."
        className="input-paper min-w-0 rounded border border-ink-100 px-2 py-1 text-micro"
      />
      <select
        aria-label="Ordenar PDFs y copias"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as WorkspaceArchiveSort)}
        className="rounded border border-ink-100 bg-paper-50 px-1.5 py-1 text-micro text-ink-500"
      >
        <option value="recent">Recientes</option>
        <option value="name">Nombre</option>
        <option value="type">Tipo</option>
      </select>
    </div>
  )
}

export function folderColorClass(color: SavedFolderColor): string {
  return {
    blue: 'bg-sky-50 text-sky-700',
    green: 'bg-emerald-50 text-emerald-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-600',
  }[color]
}
