import type { RefObject } from 'react'

export function PdfTextEditorAuxiliaryControls({
  fillMode,
  formSuggestionStatus,
  pendingFormKind,
  signatureInputRef,
  stampAccept,
  stampInputRef,
  onCancelPendingFormField,
  onSignatureFile,
  onStampFile,
}: {
  fillMode: boolean
  formSuggestionStatus: string | null
  pendingFormKind: boolean
  signatureInputRef: RefObject<HTMLInputElement>
  stampAccept: string
  stampInputRef: RefObject<HTMLInputElement>
  onCancelPendingFormField: () => void
  onSignatureFile: (file: File) => void
  onStampFile: (file: File) => void
}) {
  return (
    <>
      {!fillMode ? (
        <input
          ref={stampInputRef}
          type="file"
          accept={stampAccept}
          aria-label="Archivo de timbre"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (file) onStampFile(file)
          }}
        />
      ) : null}
      <input
        ref={signatureInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Archivo de firma"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file) onSignatureFile(file)
        }}
      />
      {!fillMode && pendingFormKind && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 border-b border-[color:var(--accent-sage)]/20 bg-[color:var(--accent-sage-soft)]/45 px-3 py-1.5 text-caption text-[color:var(--accent-sage)]"
        >
          <span className="min-w-0 truncate">
            <strong className="font-semibold">Colocar casillero</strong>
            <span className="text-[color:var(--accent-sage)]/80">
              {' '}
              · ubicación pendiente
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelPendingFormField}
            className="shrink-0 rounded px-2 py-1 text-micro font-semibold text-[color:var(--accent-sage)] transition-colors hover:bg-paper-50/70"
          >
            Cancelar creación
          </button>
        </div>
      )}
      {!fillMode && formSuggestionStatus && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-[color:var(--accent-sage)]/20 bg-paper-50 px-3 py-1.5 text-caption text-ink-600"
        >
          {formSuggestionStatus}
        </div>
      )}
    </>
  )
}
