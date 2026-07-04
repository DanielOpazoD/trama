import { useRef, useState } from 'react'
import { UploadIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { PendingAttachmentChips } from './PendingAttachmentsInput'

/**
 * Composer de prompts, plegable: en reposo es una línea limpia de título; al
 * enfocar o con contenido despliega colección, cuerpo, chips de anexos y un
 * pie sereno (ícono de adjuntar + pista + guardar) — el mismo lenguaje del
 * composer de Notas.
 */
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
  const [focused, setFocused] = useState(false)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const active =
    focused ||
    title.trim() !== '' ||
    collection.trim() !== '' ||
    content.trim() !== '' ||
    pendingFiles.length > 0

  return (
    <section
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5"
    >
      <div className={active ? 'grid sm:grid-cols-[1fr_180px] gap-2 mb-2' : ''}>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={active ? 'Título del prompt' : 'Nuevo prompt…'}
          aria-label="Título del prompt"
          className="input-paper w-full text-body"
        />
        {active && (
          <input
            value={collection}
            onChange={(e) => onCollectionChange(e.target.value)}
            placeholder="Colección"
            aria-label="Colección"
            className="input-paper w-full text-body animate-fade-up"
          />
        )}
      </div>
      {active && (
        <>
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={5}
            placeholder="Escribe el prompt..."
            aria-label="Contenido del prompt"
            className="input-paper w-full resize-y text-body leading-relaxed animate-fade-up"
          />
          <input
            ref={attachInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Adjuntar archivo"
            disabled={busy}
            onChange={(event) => {
              const list = event.currentTarget.files
              if (list?.length && !busy) {
                onPendingFilesChange([...pendingFiles, ...Array.from(list)])
              }
              event.currentTarget.value = ''
            }}
          />
          <PendingAttachmentChips
            files={pendingFiles}
            onChange={onPendingFilesChange}
            busy={busy}
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-ink-100/60 pt-2 animate-fade-up">
            <div className="flex min-w-0 items-center gap-1.5">
              <IconButton
                label="Adjuntar archivo"
                title="Adjuntar archivo"
                disabled={busy}
                onClick={() => attachInputRef.current?.click()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 disabled:opacity-40"
              >
                <UploadIcon size={13} />
              </IconButton>
              <span className="hidden min-w-0 truncate text-micro text-ink-300 sm:block">
                variables con {'{{nombre}}'}
              </span>
            </div>
            <button
              onClick={onSave}
              disabled={!title.trim() || !content.trim() || busy}
              className="btn-ink text-xs disabled:opacity-40"
            >
              guardar prompt
            </button>
          </div>
        </>
      )}
    </section>
  )
}
