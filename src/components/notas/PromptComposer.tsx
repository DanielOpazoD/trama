import { PendingAttachmentsInput } from './PendingAttachmentsInput'

export function PromptComposer({
  title,
  collection,
  content,
  pendingFiles,
  busy,
  onTitleChange,
  onCollectionChange,
  onContentChange,
  onPendingFilesChange,
  onSave,
}: {
  title: string
  collection: string
  content: string
  pendingFiles: File[]
  busy: boolean
  onTitleChange: (value: string) => void
  onCollectionChange: (value: string) => void
  onContentChange: (value: string) => void
  onPendingFilesChange: (files: File[]) => void
  onSave: () => void
}) {
  return (
    <section className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
      <div className="grid sm:grid-cols-[1fr_180px] gap-2 mb-2">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Título del prompt"
          className="input-paper w-full text-sm"
        />
        <input
          value={collection}
          onChange={(e) => onCollectionChange(e.target.value)}
          placeholder="Colección"
          className="input-paper w-full text-sm"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        rows={5}
        placeholder="Escribe el prompt..."
        className="input-paper w-full resize-y text-sm leading-relaxed"
      />
      <PendingAttachmentsInput
        files={pendingFiles}
        onChange={onPendingFilesChange}
        busy={busy}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-micro uppercase tracking-eyebrow text-ink-300">
          variables con {'{{nombre}}'}
        </span>
        <button
          onClick={onSave}
          disabled={!title.trim() || !content.trim() || busy}
          className="btn-ink text-xs disabled:opacity-40"
        >
          guardar prompt
        </button>
      </div>
    </section>
  )
}
