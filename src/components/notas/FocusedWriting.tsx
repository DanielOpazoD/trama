import { useEffect, useRef } from 'react'
import { CloseIcon } from '../Icons'
import { useFocusTrap } from '../../hooks/useFocusTrap'
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
 * se pasa `onSave`, se llama al cerrar. Escape cierra. Atrapa el foco mientras
 * está abierta y lo devuelve al disparador al cerrar (vía `useFocusTrap`).
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
  const dialogRef = useRef<HTMLDivElement>(null)
  // El cuerpo crece con el contenido; el overlay scrollea si hace falta.
  const bodyRef = useAutosizeTextarea(value, { minRows: 12, maxRows: 200 })
  // Capturamos el disparador en el PRIMER render (antes de que el autoFocus del
  // textarea mueva el foco), para poder devolvérselo al cerrar. No lo hace
  // useFocusTrap porque su captura corre tras el commit, cuando el autoFocus ya
  // robó el foco. El trap igual cubre el ciclado con Tab dentro del overlay.
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null,
  )
  useFocusTrap(dialogRef, true)

  function close() {
    onSave?.()
    onClose()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    const opener = openerRef.current
    return () => {
      window.removeEventListener('keydown', onKey)
      // Devolver el foco al disparador si sigue en el DOM.
      if (opener && document.contains(opener)) opener.focus()
    }
    // close es estable para esta vida del overlay (deps de onSave/onClose
    // raramente cambian); lo dejamos fuera para no re-suscribir en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Escritura enfocada"
      className="paper-grain fixed inset-0 z-50 overflow-y-auto bg-paper-50 animate-fade-up"
    >
      <button
        type="button"
        onClick={close}
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
