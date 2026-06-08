import type { RefObject } from 'react'

export function PdfTextEditorAuxiliaryControls({
  fillMode,
  formSuggestionStatus,
  pendingFormKind,
  signatureInputRef,
  stampAccept,
  stampInputRef,
  onSignatureFile,
  onStampFile,
}: {
  fillMode: boolean
  formSuggestionStatus: string | null
  pendingFormKind: boolean
  signatureInputRef: RefObject<HTMLInputElement>
  stampAccept: string
  stampInputRef: RefObject<HTMLInputElement>
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
          className="border-b border-[color:var(--accent-sage)]/20 bg-[color:var(--accent-sage-soft)]/45 px-3 py-1.5 text-caption text-[color:var(--accent-sage)]"
        >
          Haz clic o arrastra en la página para definir el casillero.
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
