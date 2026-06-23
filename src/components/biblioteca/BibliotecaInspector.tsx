import { useEffect, useRef } from 'react'
import type { LibraryItem } from '../../types/biblioteca'
import { CloseButton } from '../CloseButton'
import { BibliotecaTagEditor } from './BibliotecaTagEditor'
import { BibliotecaConnections } from './BibliotecaConnections'

/**
 * Inspector "Detalles" del visor de la Biblioteca (PR-C): un panel claro que
 * entra desde la derecha sobre el fondo oscuro del visor. Reúne las dos
 * ediciones de metadata del archivo:
 *
 *   - **Etiquetas** — chips removibles + alta (BibliotecaTagEditor).
 *   - **Aparece en** — conexiones con entidades / notas / momentos
 *     (BibliotecaConnections, con su picker).
 *
 * El panel es desplazable y captura el puntero (`pointer-events-auto`) dentro de
 * la capa de contenido del visor, que por lo demás deja pasar los clics al fondo
 * para cerrar. Abrir/cerrar lo controla el visor (`open` + `onClose`); acá solo
 * animamos la entrada/salida lateral.
 */
export function BibliotecaInspector({
  item,
  open,
  onClose,
}: {
  item: LibraryItem
  open: boolean
  onClose: () => void
}) {
  // Cuando el cajón está cerrado (fuera de pantalla) lo marcamos `inert`: saca
  // sus controles del orden de tabulación y del árbol de accesibilidad. Solo
  // con `aria-hidden` los botones/inputs seguirían siendo focusables con Tab.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.inert = !open
  }, [open])

  return (
    <aside
      ref={ref}
      aria-label="Detalles del archivo"
      aria-hidden={!open}
      className={`pointer-events-auto absolute inset-y-0 right-0 z-10 flex w-80 max-w-[85vw] flex-col border-l border-ink-100 bg-paper-50 shadow-2xl shadow-ink-900/30 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-ink-100/70 px-4 py-3">
        <h2 className="section-eyebrow text-ink-500">Detalles</h2>
        <CloseButton
          onClick={onClose}
          label="Cerrar detalles"
          size={16}
          className="touch-target -mr-1.5 inline-flex size-7 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <section>
          <p className="section-eyebrow mb-2 text-ink-400">Etiquetas</p>
          <BibliotecaTagEditor item={item} />
        </section>

        <section>
          <p className="section-eyebrow mb-2 text-ink-400">Aparece en</p>
          {/* Difiere la carga de conexiones hasta abrir el inspector. */}
          <BibliotecaConnections item={item} enabled={open} />
        </section>
      </div>
    </aside>
  )
}
