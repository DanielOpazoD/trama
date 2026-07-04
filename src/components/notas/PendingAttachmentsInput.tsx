import { FileIcon } from '../Icons'
import { IconButton } from '../IconButton'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Anexos pendientes como CHIPS discretos (sin panel): para composers que
 *  llevan el gatillo de adjuntar en su propio pie. */
export function PendingAttachmentChips({
  files,
  onChange,
  busy = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  busy?: boolean
}) {
  if (files.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {files.map((file, index) => (
        <span
          key={`${file.name}-${file.size}-${index}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ink-100 bg-paper-50 py-0.5 pl-2.5 pr-1 text-micro text-ink-600"
        >
          <FileIcon size={10} className="shrink-0 text-ink-300" />
          <span className="max-w-[11rem] truncate">{file.name}</span>
          <span className="shrink-0 tabular-nums text-ink-300">
            {formatBytes(file.size)}
          </span>
          <IconButton
            onClick={() => onChange(files.filter((_, i) => i !== index))}
            disabled={busy}
            label={`Quitar anexo ${file.name}`}
            title="Quitar"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-100/70 hover:text-[color:var(--accent-clay)] disabled:opacity-50"
          >
            <span aria-hidden="true">×</span>
          </IconButton>
        </span>
      ))}
    </div>
  )
}
