import { useEffect } from 'react'
import { CloseIcon } from './Icons'

/**
 * Modal con todos los keyboard shortcuts disponibles. Se abre con `?`
 * (sin modifiers, igual que GitHub/Linear/Notion).
 *
 * No hay registración programática de shortcuts — la lista es estática
 * y refleja lo que el código realmente implementa. Cualquier shortcut
 * nuevo se agrega a este array. Esa es la "fuente de verdad para el
 * usuario" — si está acá, existe; si no, no se usa.
 */

type Shortcut = {
  keys: string[]
  label: string
}

type Group = {
  title: string
  shortcuts: Shortcut[]
}

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const CMD = IS_MAC ? '⌘' : 'Ctrl'

const GROUPS: Group[] = [
  {
    title: 'Navegación',
    shortcuts: [
      { keys: [CMD, 'K'], label: 'Buscar entidades, citas, ir a sección' },
      { keys: ['?'], label: 'Ver este menú de atajos' },
      { keys: ['\\'], label: 'Modo focus — ocultar sidebar + topbar' },
      { keys: ['Esc'], label: 'Cerrar modal o panel activo' },
    ],
  },
  {
    title: 'Captura rápida',
    shortcuts: [
      { keys: ['Enter'], label: 'Enviar al chat / preguntar a la IA' },
      { keys: ['Shift', 'Enter'], label: 'Nueva línea sin enviar' },
      { keys: [CMD, 'Enter'], label: 'Enviar desde el AskBar' },
    ],
  },
  {
    title: 'Grafo',
    shortcuts: [
      { keys: ['Click'], label: 'Seleccionar nodo' },
      { keys: ['↑', '↓', '←', '→'], label: 'Navegar entre nodos con teclado' },
      { keys: ['Enter'], label: 'Abrir panel de la entidad enfocada' },
      { keys: ['Tab'], label: 'Avanzar al siguiente nodo' },
      { keys: ['Esc'], label: 'Deseleccionar nodo activo' },
    ],
  },
  {
    title: 'Edición inline',
    shortcuts: [
      { keys: ['Doble click'], label: 'Editar descripción / ensayo / cita directo' },
    ],
  },
]

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar atajos"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-view-fade"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Atajos de teclado"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-2xl max-h-[85vh]
                   bg-paper-50 border border-ink-100 rounded-xl shadow-lg shadow-ink-900/12
                   animate-fade-up flex flex-col overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-ink-100/60 flex items-baseline justify-between shrink-0">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">
              cheat sheet
            </p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">
              Atajos de teclado
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="section-eyebrow mb-3">{group.title}</h3>
              <ul className="space-y-1.5">
                {group.shortcuts.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 px-3 py-1.5 rounded-md hover:bg-paper-100/50 transition-colors"
                  >
                    <span className="text-sm text-ink-600">{s.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, ki) => (
                        <kbd
                          key={ki}
                          className="font-mono text-micro leading-none px-1.5 py-1 min-w-[1.5rem] text-center bg-paper-100 border border-ink-200/70 rounded text-ink-600 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="px-6 py-3 border-t border-ink-100/60 text-micro text-ink-300 tabular-nums shrink-0">
          presiona <kbd className="font-sans px-1 mx-1 bg-paper-100 border border-ink-200/70 rounded">?</kbd>
          en cualquier momento para abrir esta lista
        </footer>
      </div>
    </>
  )
}
