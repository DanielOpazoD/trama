import { useRef, useState } from 'react'
import { ArchiveIcon, UploadIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { PendingAttachmentChips } from './PendingAttachmentsInput'
import {
  ComposerCard,
  ComposerFooter,
  composerIconButtonClass,
  composerTitleClass,
} from './composerChrome'

const ACCENT = 'var(--accent-sage)'
const ACCENT_SOFT = 'var(--accent-sage-soft)'

/**
 * Composer de prompts sobre el chrome compartido: en reposo es una línea de
 * papel («Nuevo prompt…»); al enfocar, la línea SE CONVIERTE en el título
 * serif y se despliegan cuerpo, chips de anexos y el pie sereno. La colección
 * —uso poco frecuente— vive sutil en el pie, no como campo protagonista.
 */
export function PromptComposer({
  title,
  collection,
  content,
  pendingFiles,
  busy,
  justSaved = false,
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
  justSaved?: boolean
  onTitleChange: (value: string) => void
  onCollectionChange: (value: string) => void
  onContentChange: (value: string) => void
  onPendingFilesChange: (files: File[]) => void
  onSave: () => void
}) {
  const [focused, setFocused] = useState(false)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const active =
    focused ||
    title.trim() !== '' ||
    collection.trim() !== '' ||
    content.trim() !== '' ||
    pendingFiles.length > 0

  return (
    <ComposerCard
      accent={ACCENT}
      accentSoft={ACCENT_SOFT}
      focused={focused}
      className="mb-5"
      onFocusWithin={() => setFocused(true)}
      onBlurWithin={() => setFocused(false)}
    >
      <input
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            contentRef.current?.focus()
          }
        }}
        maxLength={200}
        placeholder={active ? 'Título del prompt' : 'Nuevo prompt…'}
        aria-label="Título del prompt"
        className={
          active
            ? composerTitleClass
            : 'w-full bg-transparent text-body text-ink-700 placeholder:text-ink-300'
        }
      />
      {active && (
        <>
          <textarea
            ref={contentRef}
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            rows={4}
            placeholder="Escribe el prompt… usa {{variables}} para las partes que cambian"
            aria-label="Contenido del prompt"
            // focus-ring-exempt: el marco de la tarjeta ya marca el foco (borde acento + halo)
            className="w-full resize-y bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed animate-fade-up focus-visible:outline-none"
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
          <ComposerFooter
            accent={ACCENT}
            hint={`variables con ${'{{nombre}}'}`}
            ctaLabel="guardar prompt"
            ctaDisabled={!title.trim() || !content.trim() || busy}
            justSaved={justSaved}
            onSave={onSave}
          >
            <IconButton
              label="Adjuntar archivo"
              title="Adjuntar archivo"
              disabled={busy}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => attachInputRef.current?.click()}
              className={composerIconButtonClass}
            >
              <UploadIcon size={13} />
            </IconButton>
            <span className="ml-1 flex min-w-0 items-center gap-1">
              <ArchiveIcon size={12} className="shrink-0 text-ink-300" />
              <input
                value={collection}
                onChange={(event) => onCollectionChange(event.target.value)}
                placeholder="Colección"
                aria-label="Colección"
                className="w-24 bg-transparent text-micro text-ink-500 placeholder:text-ink-300 sm:w-32"
              />
            </span>
          </ComposerFooter>
        </>
      )}
    </ComposerCard>
  )
}
