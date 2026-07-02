import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { CameraIcon, ScissorsIcon, UploadIcon } from '../Icons'
import { MarkdownField } from './MarkdownField'
import { PendingAttachmentsInput } from './PendingAttachmentsInput'
import { buildNotasComposerCta } from './notasComposerModel'

export function NotasFeedComposer({
  accent,
  title,
  draft,
  pendingFiles,
  allNoteTags,
  textareaRef,
  dragging,
  composerFocused,
  composerActive,
  isLinkDraft,
  justSaved,
  createNoteBusy,
  uploadAttachmentBusy,
  createRecorteBusy,
  onTitleChange,
  onDraftChange,
  onPendingFilesChange,
  onComposerFocus,
  onComposerBlur,
  onComposerDragOver,
  onComposerDragLeave,
  onComposerDrop,
  onComposerPaste,
  onComposerKeyDown,
  onCaptureMediaInput,
  onRequestFocusMode,
  onForceNote,
  onSave,
}: {
  accent: string
  title: string
  draft: string
  pendingFiles: File[]
  allNoteTags: string[]
  textareaRef: RefObject<HTMLTextAreaElement>
  dragging: boolean
  composerFocused: boolean
  composerActive: boolean
  isLinkDraft: boolean
  justSaved: boolean
  createNoteBusy: boolean
  uploadAttachmentBusy: boolean
  createRecorteBusy: boolean
  onTitleChange: (next: string) => void
  onDraftChange: (next: string) => void
  onPendingFilesChange: (next: File[]) => void
  onComposerFocus: () => void
  onComposerBlur: () => void
  onComposerDragOver: (event: DragEvent<HTMLDivElement>) => void
  onComposerDragLeave: () => void
  onComposerDrop: (event: DragEvent<HTMLDivElement>) => void
  onComposerPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  onComposerKeyDown: (
    event: KeyboardEvent<HTMLInputElement> | KeyboardEvent<HTMLTextAreaElement>,
  ) => void
  onCaptureMediaInput: (event: ChangeEvent<HTMLInputElement>) => void
  onRequestFocusMode: () => void
  onForceNote: () => void
  onSave: () => void
}) {
  const captureMediaInputRef = useRef<HTMLInputElement>(null)
  const cta = buildNotasComposerCta({
    draft,
    isLinkDraft,
    createNoteBusy,
    createRecorteBusy,
  })

  return (
    <div
      onFocusCapture={onComposerFocus}
      onBlurCapture={onComposerBlur}
      onDragOver={onComposerDragOver}
      onDragLeave={onComposerDragLeave}
      onDrop={onComposerDrop}
      className={`card-paper-soft rounded-xl border p-3 mb-4 transition ${
        dragging ? 'border-dashed' : 'border-ink-100/70'
      }`}
      style={
        dragging
          ? { borderColor: accent, background: 'var(--accent-sage-soft)' }
          : composerFocused
            ? { borderColor: accent, boxShadow: '0 0 0 3px var(--accent-sage-soft)' }
            : undefined
      }
    >
      <input
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
            event.preventDefault()
            textareaRef.current?.focus()
            return
          }
          onComposerKeyDown(event)
        }}
        maxLength={200}
        placeholder="Título (opcional)"
        aria-label="Título de la nota (opcional)"
        className="w-full bg-transparent font-serif text-lead text-ink-800 placeholder:font-sans placeholder:not-italic placeholder:text-ink-300 mb-1"
      />
      <MarkdownField
        value={draft}
        onChange={onDraftChange}
        textareaRef={textareaRef}
        onKeyDown={onComposerKeyDown}
        onPaste={onComposerPaste}
        rows={3}
        placeholder="Escribe una nota, pega un enlace o suelta una imagen o video… usa #etiquetas"
        aria-label="Captura: escribe una nota, pega un enlace o pega/suelta una imagen o video"
        onRequestFocusMode={onRequestFocusMode}
        tagUniverse={allNoteTags}
        className="w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed pr-8"
      />
      <PendingAttachmentsInput
        files={pendingFiles}
        onChange={onPendingFilesChange}
        busy={createNoteBusy || uploadAttachmentBusy}
      />
      <div className="mt-2 flex justify-end">
        <input
          ref={captureMediaInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          multiple
          className="sr-only"
          aria-label="Elegir imagen o video para capturar"
          disabled={createRecorteBusy}
          onChange={onCaptureMediaInput}
        />
        <button
          type="button"
          onClick={() => captureMediaInputRef.current?.click()}
          disabled={createRecorteBusy}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-100 bg-paper-50 px-2.5 py-1.5 text-micro uppercase tracking-eyebrow text-ink-500 transition-colors hover:border-ink-200 hover:text-ink-800"
        >
          <UploadIcon size={12} />
          Capturar imagen o video
        </button>
      </div>

      {isLinkDraft && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-micro text-ink-400">
          <ScissorsIcon size={11} className="text-[color:var(--accent-sage)]" />
          Detectamos un enlace — se guardará como recorte en tus capturas.
          <button
            type="button"
            onClick={onForceNote}
            className="underline hover:text-ink-700 transition-colors"
          >
            guardar como nota
          </button>
        </p>
      )}

      {composerActive && (
        <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-ink-100/60 animate-fade-up">
          <span className="flex items-center gap-1.5 text-micro text-ink-300">
            <CameraIcon size={11} />
            {cta.mediaHint}
          </span>
          <div className="relative">
            <button
              onClick={onSave}
              disabled={cta.disabled}
              className="btn-ink text-xs disabled:opacity-40"
            >
              {cta.label}
            </button>
            {justSaved && (
              <span
                aria-hidden
                className="animate-saved-ripple pointer-events-none absolute inset-0 rounded-md"
                style={{ boxShadow: `0 0 0 2px ${accent}` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
