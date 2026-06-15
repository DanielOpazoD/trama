import { useCallback, useId, useRef, useState, type RefObject } from 'react'
import { bold, italic, link, quote, type FormatResult } from '../../lib/markdownFormat'
import { BoldIcon, ItalicIcon, LinkIcon, QuoteIcon, ExpandIcon } from '../Icons'

type Transform = (value: string, selStart: number, selEnd: number) => FormatResult

const ACTIONS: Array<{
  key: string
  label: string
  hint: string
  fn: Transform
  Icon: typeof BoldIcon
}> = [
  { key: 'bold', label: 'Negrita', hint: 'Negrita · ⌘B', fn: bold, Icon: BoldIcon },
  { key: 'italic', label: 'Cursiva', hint: 'Cursiva · ⌘I', fn: italic, Icon: ItalicIcon },
  { key: 'quote', label: 'Cita', hint: 'Cita', fn: quote, Icon: QuoteIcon },
  { key: 'link', label: 'Enlace', hint: 'Enlace', fn: link, Icon: LinkIcon },
]

/**
 * Campo de markdown reutilizable: un `<textarea>` con una barra de formato
 * discreta que aparece SOLO cuando hay texto seleccionado dentro del campo, más
 * los atajos ⌘/Ctrl+B (negrita) y ⌘/Ctrl+I (cursiva). Opcionalmente muestra un
 * disparador sin palabras de "escritura enfocada".
 *
 * Posicionamiento robusto (no frágil): la barra se ancla SIEMPRE arriba del
 * campo (no sigue el caret con un mirror-div), y solo se revela cuando hay
 * selección. Entra con `animate-fade-up`; respeta `prefers-reduced-motion` vía
 * la utilidad canónica. Se oculta al colapsar la selección o al perder el foco
 * (con un pequeño retardo para que el click en la barra registre).
 *
 * Presentacional y mínimo: el estado del texto vive en el caller (`value` /
 * `onChange`). El caller puede pasar su propio `textareaRef` (p. ej. el de
 * `useAutosizeTextarea`) — lo enganchamos al textarea y lo reutilizamos para
 * leer/escribir la selección, así el autosize sigue funcionando.
 */
export function MarkdownField({
  value,
  onChange,
  textareaRef: externalRef,
  placeholder,
  rows = 4,
  autoFocus,
  onKeyDown,
  onPaste,
  onRequestFocusMode,
  className = 'w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  textareaRef?: RefObject<HTMLTextAreaElement>
  placeholder?: string
  rows?: number
  autoFocus?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  /** Si se pasa, se muestra el disparador de escritura enfocada. */
  onRequestFocusMode?: () => void
  className?: string
  'aria-label'?: string
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const ref = externalRef ?? internalRef
  const toolbarId = useId()
  // ¿Hay selección no vacía dentro del campo? Controla la visibilidad de la barra.
  const [hasSelection, setHasSelection] = useState(false)
  // Cierre diferido al hacer blur, para que el click en un botón de la barra
  // (que dispara blur en el textarea) alcance a ejecutarse antes de ocultarla.
  const blurTimer = useRef<number | null>(null)

  const syncSelection = useCallback(() => {
    const el = ref.current
    if (!el) return
    setHasSelection(el.selectionStart !== el.selectionEnd)
  }, [ref])

  /** Aplica una transform al rango seleccionado y reposiciona el caret. */
  const apply = useCallback(
    (fn: Transform) => {
      const el = ref.current
      if (!el) return
      const {
        value: next,
        selStart,
        selEnd,
      } = fn(value, el.selectionStart, el.selectionEnd)
      onChange(next)
      // Tras el re-render, reponer foco y selección sobre el nuevo texto.
      requestAnimationFrame(() => {
        const t = ref.current
        if (!t) return
        t.focus()
        t.setSelectionRange(selStart, selEnd)
        setHasSelection(selStart !== selEnd)
      })
    },
    [ref, value, onChange],
  )

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘/Ctrl+B y ⌘/Ctrl+I aplican negrita/cursiva sin romper ⌘↵ (save) ni el
    // onKeyDown del caller, que corre después.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'b') {
        e.preventDefault()
        apply(bold)
        return
      }
      if (k === 'i') {
        e.preventDefault()
        apply(italic)
        return
      }
    }
    onKeyDown?.(e)
  }

  function handleBlur() {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
    blurTimer.current = window.setTimeout(() => setHasSelection(false), 120)
  }

  function cancelBlurClose() {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
  }

  return (
    <div className="relative">
      {/* Barra de formato: anclada arriba del campo, revelada solo con selección.
          No es un toolbar permanente — aparece "al intentar" y se va sola. */}
      {hasSelection && (
        <div
          id={toolbarId}
          role="toolbar"
          aria-label="Formato de texto"
          // onMouseDown.preventDefault: que el click NO robe el foco del
          // textarea (si no, la selección se pierde antes de aplicar).
          onMouseDown={(e) => {
            e.preventDefault()
            cancelBlurClose()
          }}
          className="absolute -top-1 left-0 z-10 -translate-y-full animate-fade-up
                     inline-flex items-center gap-0.5 rounded-lg border border-ink-100/70
                     bg-paper-50/95 p-0.5 shadow-sm backdrop-blur-sm"
        >
          {ACTIONS.map(({ key, label, hint, fn, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => apply(fn)}
              aria-label={label}
              title={hint}
              className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-md
                         text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onSelect={syncSelection}
        onMouseUp={syncSelection}
        onKeyUp={syncSelection}
        onBlur={handleBlur}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-controls={hasSelection ? toolbarId : undefined}
        className={className}
      />

      {/* Disparador de escritura enfocada — botón sin palabras, mismo idioma que
          el chevron de NoteCard. Discreto, abajo a la derecha del campo. */}
      {onRequestFocusMode && (
        <button
          type="button"
          onClick={onRequestFocusMode}
          aria-label="Abrir escritura enfocada"
          title="Escritura enfocada"
          className="absolute bottom-0 right-0 inline-flex h-7 w-7 items-center justify-center
                     rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <ExpandIcon size={14} />
        </button>
      )}
    </div>
  )
}
