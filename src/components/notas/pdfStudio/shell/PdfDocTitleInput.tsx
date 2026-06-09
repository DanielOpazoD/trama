import { useEffect, useState } from 'react'

/**
 * Título editable del documento de Imprenta — el gesto "este PDF es un objeto
 * con nombre". Serif sobre fondo transparente; confirma al salir del campo o
 * con Enter (no en cada tecla, para no ensuciar el borrador autoguardado con
 * estados intermedios). Vacío vuelve a "Documento sin título".
 */
export function PdfDocTitleInput({
  title,
  onCommit,
}: {
  title: string
  onCommit: (title: string) => void
}) {
  const [value, setValue] = useState(title)
  // Re-sincroniza si el doc cambia por fuera (abrir guardado, nuevo documento).
  useEffect(() => setValue(title), [title])
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setValue(title)
          e.currentTarget.blur()
        }
      }}
      maxLength={120}
      placeholder="Documento sin título"
      aria-label="Título del documento"
      className="w-full min-w-0 bg-transparent font-serif text-h2 tracking-tight text-ink-800 placeholder:text-ink-300 leading-snug"
    />
  )
}
