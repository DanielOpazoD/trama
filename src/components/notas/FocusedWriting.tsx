import { useEffect, useRef } from 'react'
import { CloseIcon } from '../Icons'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { MarkdownField } from './MarkdownField'

/**
 * Escritura enfocada: una superficie de escritura a pantalla completa, sin
 * distracciones — papel + grano, columna centrada de medida de lectura, cuerpo
 * en serif Spectral a tamaño generoso (mismo espíritu que el modo lectura de
 * ensayos, pero en modo ESCRITURA). Incluye la misma barra de formato del campo
 * de notas (negrita / cursiva / cita / enlace + ⌘B/⌘I).
 *
 * Edita el MISMO borrador del caller: `value`/`onChange` fluyen en vivo, así al
 * cerrar el caller ya tiene el texto último (no hace falta guardar aparte). Si
 * se pasa `onSave`, se llama al cerrar. Escape cierra. Atrapa el foco, bloquea
 * el scroll del fondo y respeta el stack de overlays vía `useModalOverlay`; el
 * foco al disparador se restaura abajo (ver `openerRef`).
 *
 * Se carga con `React.lazy` desde sus call sites para no inflar el chunk de
 * NotasWorld con la superficie de escritura completa.
 */
export function FocusedWriting({
  value,
  onChange,
  title,
  onTitleChange,
  titlePlaceholder = 'Título (opcional)',
  bodyPlaceholder = 'Escribe sin distracciones…',
  onClose,
  onSave,
}: {
  value: string
  onChange: (next: string) => void
  /** Título opcional — si se pasa `onTitleChange`, se muestra el input serif. */
  title?: string
  onTitleChange?: (next: string) => void
  titlePlaceholder?: string
  bodyPlaceholder?: string
  onClose: () => void
  onSave?: () => void
}) {
  // El cuerpo crece con el contenido; el overlay scrollea si hace falta.
  const bodyRef = useAutosizeTextarea(value, { minRows: 12, maxRows: 200 })
  // Capturamos el disparador en el PRIMER render (antes de que el autoFocus del
  // textarea mueva el foco), para poder devolvérselo al cerrar. El focus trap de
  // useModalOverlay NO sirve para esto: su captura corre tras el commit, cuando
  // el autoFocus del textarea ya robó el foco — restauraría al textarea, no al
  // disparador. El hook sí cubre el ciclado con Tab y respeta el autoFocus.
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null,
  )

  // Escape guarda antes de cerrar: lo preservamos en el onClose del overlay.
  // El componente solo se monta cuando está abierto (los call sites lo renderizan
  // condicionalmente), así que el overlay siempre está `open`.
  // save-then-close compartido por el botón X y el Escape del overlay. Antes el
  // botón apuntaba a un `close` inexistente -> resolvía al global window.close()
  // (no-op): no cerraba ni guardaba.
  const handleClose = () => {
    onSave?.()
    onClose()
  }
  const overlay = useModalOverlay({ open: true, onClose: handleClose })

  useEffect(() => {
    const opener = openerRef.current
    return () => {
      // Devolver el foco al disparador si sigue en el DOM.
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return (
    <div
      ref={overlay.dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Escritura enfocada"
      className="paper-grain fixed inset-0 z-50 overflow-y-auto bg-paper-50 animate-fade-up"
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Cerrar escritura enfocada"
        title="Cerrar"
        className="fixed right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center
                   rounded-full text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        <CloseIcon />
      </button>

      <div className="mx-auto max-w-prose px-6 py-16 md:py-24">
        <p className="section-eyebrow-serif text-ink-300">escritura enfocada</p>
        <span
          aria-hidden
          className="mb-8 mt-3 block h-px w-10"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        />

        {onTitleChange && (
          <input
            value={title ?? ''}
            onChange={(e) => onTitleChange(e.target.value)}
            maxLength={200}
            placeholder={titlePlaceholder}
            aria-label="Título de la nota (opcional)"
            className="mb-4 w-full bg-transparent font-serif text-h2 leading-snug text-ink-800
                       placeholder:font-sans placeholder:text-lead placeholder:not-italic
                       placeholder:text-ink-300"
          />
        )}

        <MarkdownField
          value={value}
          onChange={onChange}
          textareaRef={bodyRef}
          rows={12}
          autoFocus
          placeholder={bodyPlaceholder}
          aria-label="Contenido de la nota"
          className="w-full resize-none bg-transparent font-serif text-lead leading-[1.75] text-ink-700
                     placeholder:not-italic placeholder:text-ink-300"
        />
      </div>
    </div>
  )
}
