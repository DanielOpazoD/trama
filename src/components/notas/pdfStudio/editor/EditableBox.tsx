import { useEffect, useRef, type CSSProperties } from 'react'
import { ACCENT } from './editorStyle'

/**
 * Edición INLINE del texto SOBRE el cuadro (no en la barra). `contentEditable` NO
 * controlado: setea el contenido inicial por ref al montar y lo lee al confirmar,
 * así el cursor no salta. Enter/blur confirman; Escape cancela. Detiene la
 * propagación para no disparar los atajos globales (Supr/flechas) ni el drag.
 */
export function EditableBox({
  initial,
  style,
  onCommit,
  onCancel,
}: {
  initial: string
  style: CSSProperties
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = initial
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // sólo al montar (es no controlado a propósito)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const commit = () => onCommit((ref.current?.textContent ?? '').replace(/\r?\n/g, ' '))
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Editar texto"
      spellCheck={false}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      style={{
        ...style,
        cursor: 'text',
        userSelect: 'text',
        outline: `1.5px solid ${ACCENT}`,
        outlineOffset: 0,
      }}
    />
  )
}
