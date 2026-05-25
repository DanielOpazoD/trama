import { useEffect, useState } from 'react'

/**
 * ι5: Folio number — número de página estilo libro impreso, fade-in
 * solo cuando el usuario empieza a scrollear (para no añadir ruido
 * cuando se ve la lista entera desde el principio).
 *
 * Se posiciona fixed en la esquina inferior izquierda. Solo desktop.
 * Mostrar "23 / 77" — el current count visible + el total.
 *
 * Uso típico:
 *   <Folio current={visibleIndex + 1} total={entities.length} />
 *
 * El cálculo de "current" lo hace el caller — puede ser el último
 * item visible en un virtualizer, o el scrollTop / itemHeight, según
 * lo que el caller tenga a mano.
 */
export function Folio({
  current,
  total,
}: {
  current: number
  total: number
}) {
  // Solo mostrar cuando hayas scrolleado un poco. Sin este gate, el
  // folio aparece desde el primer pixel y compite con el header de
  // la vista por atención.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    function onScroll() {
      // Buscar el scrollable principal (el div con overflow-y-auto que
      // contiene la vista). Heurística: el ancestro scrolleable más
      // cercano al body.
      const main = document.querySelector('main [class*="overflow-y-auto"]') as HTMLElement | null
      const scrollTop = main?.scrollTop ?? window.scrollY
      setVisible(scrollTop > 200)
    }
    onScroll()
    const main = document.querySelector('main [class*="overflow-y-auto"]')
    main?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      main?.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  if (total <= 0) return null

  return (
    <div
      aria-hidden
      className={`hidden md:block fixed bottom-6 left-8 z-10 transition-opacity duration-500 ease-out ${
        visible ? 'opacity-60' : 'opacity-0 pointer-events-none'
      }`}
      style={{ fontFamily: 'Spectral, Iowan Old Style, Palatino, Georgia, serif' }}
    >
      {/* ω-A: removido italic — los números no se benefician de la
          cursiva. tabular-nums + serif suficiente para el feel de folio
          de libro. */}
      <span className="text-xs text-ink-400 tabular-nums">
        {current} <span className="text-ink-200">/</span> {total}
      </span>
    </div>
  )
}
