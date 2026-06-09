import { FileIcon, TrashIcon, UploadIcon } from '../Icons'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PendingAttachmentsInput({
  files,
  onChange,
  busy = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  busy?: boolean
}) {
  function addFiles(list: FileList | null) {
    if (!list || busy) return
    onChange([...files, ...Array.from(list)])
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-ink-100/80 bg-paper-50/45 px-3 py-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="section-eyebrow text-ink-400">anexos</p>
        </div>
        <label className="inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-100 bg-paper-50 px-2.5 py-1.5 text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-800 hover:border-ink-200 transition-colors cursor-pointer">
          <UploadIcon size={12} />
          adjuntar archivo
          <input
            type="file"
            multiple
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files)
              e.currentTarget.value = ''
            }}
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-2 rounded-md border border-ink-100/60 bg-paper-50 px-2 py-1.5 text-caption"
            >
              <FileIcon size={12} className="shrink-0 text-ink-300" />
              <span className="min-w-0 flex-1 truncate text-ink-600">{file.name}</span>
              <span className="shrink-0 text-micro tabular-nums text-ink-300">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={busy}
                aria-label="Quitar anexo pendiente"
                title="Quitar"
                className="shrink-0 p-1 text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors disabled:opacity-50"
              >
                <TrashIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
