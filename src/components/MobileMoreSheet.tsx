import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ViewMode } from '../types/view'
import { MOBILE_MORE_GROUPS } from '../lib/navigation'
import { SECTION_ACCENT } from '../lib/sectionAccent'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

/**
 * Hoja "Más" de la navegación móvil. La bottom nav solo expone 4 vistas
 * primarias; esta hoja abre TODO el resto (Recortes, Escuchas, Twitter,
 * Grafo, Cronología, Atlas, Chat, Sugerencias) — varias de ellas eran
 * inalcanzables en móvil porque no cabían en la barra.
 *
 * Es un overlay modal de verdad: portal a document.body (para escapar el
 * stacking context de la barra), `z-modal` sobre la nav, y adopta las dos
 * primitivas compartidas que ya existen — `useFocusTrap` (trampa de foco +
 * restauración) y `useBodyScrollLock` (no scrollear el fondo). Cierra con
 * Escape, clic en el backdrop, o al elegir una vista.
 */
export function MobileMoreSheet({
  open,
  onClose,
  view,
  onChangeView,
}: {
  open: boolean
  onClose: () => void
  view: ViewMode
  onChangeView: (v: ViewMode) => void
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(sheetRef, open)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Más vistas"
    >
      {/* Backdrop — primero en el DOM, queda debajo de la hoja. */}
      <button
        type="button"
        aria-label="Cerrar fondo"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/40 backdrop-blur-sm animate-fade-up motion-reduce:animate-none"
      />

      {/* Hoja — sube desde el borde inferior. */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl border-t border-ink-100/70 bg-paper-50 px-4 pt-3 shadow-2xl shadow-ink-900/20 animate-slide-up motion-reduce:animate-none"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {/* Asa — afordancia de hoja arrastrable (decorativa). */}
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-200/80" />

        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <p className="section-eyebrow text-ink-300">ir a</p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">Más vistas</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="touch-target -mr-1 rounded-md p-2 text-ink-300 hover:bg-ink-100/60 hover:text-ink-700 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {MOBILE_MORE_GROUPS.map((group) => (
          <section key={group.label ?? 'root'} className="mb-3 last:mb-0">
            {group.label && (
              <p className="section-eyebrow mb-1.5 px-1 text-ink-300">{group.label}</p>
            )}
            <ul className="grid grid-cols-2 gap-1.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = view === item.value
                const accent = SECTION_ACCENT[item.value]
                return (
                  <li key={item.value}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        onChangeView(item.value)
                        onClose()
                      }}
                      className={`touch-target flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-ink-100 bg-ink-100/50'
                          : 'border-transparent hover:bg-ink-100/40'
                      }`}
                    >
                      <span
                        className="inline-flex shrink-0"
                        style={{ color: active ? accent : 'rgb(var(--ink-400))' }}
                      >
                        <Icon size={18} />
                      </span>
                      <span
                        className={`truncate text-sm ${active ? 'font-medium text-ink-800' : 'text-ink-700'}`}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  )
}
