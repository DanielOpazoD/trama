import { useRef, useState, type FormEvent } from 'react'

/**
 * Salto a una hoja concreta, dentro de la barra del documento.
 *
 * Con pocas hojas no existe: el contador se queda como el rótulo que era. Con
 * un libro largo, en cambio, la grilla mide decenas de miles de píxeles y no
 * hay forma de llegar a la hoja 480 que no sea arrastrar la barra de scroll a
 * ojo. La interfaz crece con el trabajo, igual que el resto de esta barra.
 *
 * Encuentra la hoja por `data-page-index` y no por posición en la lista: si
 * alguna vez la grilla filtra o agrupa, buscar «la enésima tarjeta» llevaría a
 * la hoja equivocada sin avisar.
 */
export function PdfSheetJump({ total }: { total: number }) {
  const [value, setValue] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  function jump(event: FormEvent) {
    event.preventDefault()
    const requested = Number.parseInt(value, 10)
    if (!Number.isFinite(requested)) return
    const index = Math.min(Math.max(requested, 1), total) - 1
    const card = formRef.current
      ?.closest('.pdf-studio-canvas')
      ?.querySelector<HTMLElement>(`[data-page-index="${index}"]`)
    if (!card) return
    // `focus()` ya arrastra el scroll por sí solo —medido: en Chromium deja el
    // mismo scrollTop que esta llamada—, pero la alineación que elige el
    // navegador no está especificada y otros alinean al borde más cercano.
    // `center` la fija: la hoja aterriza con contexto arriba y abajo, que es lo
    // que dice en qué parte del documento estás. El `focus` va después y es
    // para el teclado, no para el scroll.
    card.scrollIntoView({ block: 'center' })
    card.focus()
  }

  return (
    <form
      ref={formRef}
      onSubmit={jump}
      className="hidden items-center gap-1 text-micro text-ink-300 sm:flex"
    >
      <label htmlFor="pdf-sheet-jump" className="sr-only">
        Ir a la hoja
      </label>
      <input
        id="pdf-sheet-jump"
        type="number"
        min={1}
        max={total}
        inputMode="numeric"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="hoja"
        title={`Escribe un número entre 1 y ${total} y pulsa Enter`}
        className="w-14 rounded border border-ink-200 bg-paper-50 px-1.5 py-0.5 text-micro tabular-nums text-ink-700 placeholder:text-ink-300"
      />
      <span className="tabular-nums">de {total}</span>
    </form>
  )
}
