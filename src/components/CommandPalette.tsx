import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { ViewMode } from '../types/view'
import {
  useCommandSearch,
  type CommandAction,
  type Item,
} from '../hooks/useCommandSearch'
import { useModalOverlay } from '../hooks/useModalOverlay'
import { useAskQuery, useRunQuery, useSaveQuery } from '../state/useSavedQueries'
import { useToast } from '../state/toast'
import type { QueryHit, QueryInput } from '../api/query'
import type { NotasSection } from '../types/notas'
import { CommandPaletteSearchMode } from './commandPalette/CommandPaletteSearchMode'
import {
  getCommandPaletteActiveLength,
  type CommandPaletteMode,
} from './commandPalette/commandPaletteModel'

// El modo "resultados" (motor de consultas) se carga on-demand: el camino
// común buscar/navegar no necesita su código, así el bundle del palette no
// crece para todos.
const CommandPaletteResults = lazy(() =>
  import('./CommandPaletteResults').then((m) => ({ default: m.CommandPaletteResults })),
)

// `CommandAction` se define en useCommandSearch; lo re-exportamos acá para no
// romper imports existentes que lo toman desde este módulo.
export type { CommandAction }

// σ-followup: símbolo del modificador. Antes vivía en TopBar — al
// mover el atajo visual al palette, este módulo lo necesita propio.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const SHORTCUT_KEY = IS_MAC ? '⌘' : 'Ctrl'

/**
 * Cmd+K palette. Search-as-you-type across views + entities + quotes.
 * Arrows navigate, Enter selects, Escape closes.
 *
 * La búsqueda (query, filtro local + servidor, items) vive en
 * `useCommandSearch`. Este componente se queda con la presentación y la
 * interacción: foco del input, navegación por teclado y despacho de la
 * selección a los callbacks del padre.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSelectEntity,
  onAction,
  onOpenThread,
  onRevealNotasModule,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: ViewMode) => void
  onSelectEntity: (id: string) => void
  /** Acciones rápidas (Nueva entidad, Configuración, etc.). Si no se
      pasa, el palette las oculta. */
  onAction?: (action: CommandAction) => void
  /** Abrir un hilo de chat por id (para resultados de tipo chat). Si no se
      pasa, los resultados de chat navegan a la vista Chat sin hilo. */
  onOpenThread?: (threadId: string) => void
  /** Revelar/abrir un módulo del mundo Notas (cruza de mundo). Para el comando
      "#pass" → Claves desde el ⌘K del mundo principal. */
  onRevealNotasModule?: (moduleId: NotasSection) => void
}) {
  const { query, setQuery, items, searching, entitiesForPeek } = useCommandSearch({
    open,
    actionsEnabled: Boolean(onAction),
  })
  const [focusIdx, setFocusIdx] = useState(0)

  // δ-unificado: segundo modo del palette. 'search' es el comportamiento
  // clásico (find/navigate). 'results' muestra los hits del motor de consultas
  // tras un "Preguntar" o correr una consulta guardada.
  const [mode, setMode] = useState<CommandPaletteMode>('search')
  const [results, setResults] = useState<{
    hits: QueryHit[]
    ast: QueryInput | null
    source?: 'llm' | 'fallback'
    heading: string
  } | null>(null)
  const [running, setRunning] = useState(false)

  const ask = useAskQuery()
  const run = useRunQuery()
  const saveQuery = useSaveQuery()
  const toast = useToast()

  // Reset a modo búsqueda al abrir el palette o cuando la query cambia: nunca
  // arrastramos resultados de una sesión previa.
  useEffect(() => {
    if (open) {
      setMode('search')
      setResults(null)
      setRunning(false)
    }
  }, [open])

  // Reset del índice resaltado al abrir. El foco inicial del input lo maneja
  // el focus trap de useModalOverlay (el input es el primer focuseable del
  // diálogo). La query y los resultados de servidor los resetea
  // useCommandSearch.
  useEffect(() => {
    if (open) {
      setFocusIdx(0)
    }
  }, [open])

  useEffect(() => {
    setFocusIdx(0)
    // Cambiar la query con intención vuelve a modo búsqueda.
    setMode('search')
    setResults(null)
  }, [query])

  // Escape: delegado a useModalOverlay (respeta el stack de overlays + focus
  // trap + scroll-lock). En modo resultados NO cierra el palette: vuelve a
  // búsqueda. En modo búsqueda cierra. Esta lógica mode-aware corre como el
  // onClose del overlay.
  const handleEscape = useCallback(() => {
    if (mode === 'results') {
      setMode('search')
      setResults(null)
      setFocusIdx(0)
    } else {
      onClose()
    }
  }, [mode, onClose])

  const overlay = useModalOverlay({ open, onClose: handleEscape })

  const runAst = useCallback(
    (queryInput: QueryInput, heading: string) => {
      setRunning(true)
      run
        .mutateAsync(queryInput)
        .then((res) => {
          setResults({ hits: res.items, ast: queryInput, heading })
          setMode('results')
          setFocusIdx(0)
        })
        .catch(() => {
          toast.show({ message: 'No se pudo ejecutar la consulta.', tone: 'error' })
        })
        .finally(() => setRunning(false))
    },
    [run, toast],
  )

  const runAsk = useCallback(
    (q: string) => {
      setRunning(true)
      ask
        .mutateAsync(q)
        .then((res) => {
          setResults({
            hits: res.items,
            ast: res.query,
            source: res.source,
            heading: `«${q}»`,
          })
          setMode('results')
          setFocusIdx(0)
        })
        .catch(() => {
          toast.show({ message: 'No se pudo interpretar la pregunta.', tone: 'error' })
        })
        .finally(() => setRunning(false))
    },
    [ask, toast],
  )

  const selectHit = useCallback(
    (hit: QueryHit) => {
      switch (hit.kind) {
        case 'entity':
          onSelectEntity(hit.id)
          break
        case 'quote':
          onNavigate('citas')
          break
        case 'momento':
          onNavigate('momentos')
          break
        case 'note':
          onRevealNotasModule?.('notas')
          break
      }
      onClose()
    },
    [onClose, onNavigate, onSelectEntity, onRevealNotasModule],
  )

  const selectItem = useCallback(
    (item: Item) => {
      switch (item.kind) {
        case 'view':
          onNavigate(item.view)
          break
        case 'action':
          onAction?.(item.action)
          break
        case 'entity':
          onSelectEntity(item.id)
          break
        case 'quote':
          // Cita → abrir el panel de su entidad.
          onSelectEntity(item.entityId)
          break
        case 'momento':
          // No hay deep-link a un momento puntual (lista infinita); llevamos
          // a la vista Momentos.
          onNavigate('momentos')
          break
        case 'cronica':
          // Las crónicas viven en Inicio.
          onNavigate('inicio')
          break
        case 'chat':
          if (onOpenThread) onOpenThread(item.threadId)
          else onNavigate('chat')
          break
        case 'reveal':
          onRevealNotasModule?.(item.moduleId)
          break
        case 'ask':
          // No cerramos: pasamos a modo resultados dentro del mismo palette.
          runAsk(item.q)
          return
        case 'savedQuery':
          runAst(item.query, item.name)
          return
      }
      onClose()
    },
    [
      onAction,
      onClose,
      onNavigate,
      onOpenThread,
      onRevealNotasModule,
      onSelectEntity,
      runAsk,
      runAst,
    ],
  )

  useEffect(() => {
    if (!open) return
    // La lista activa para arrows/Enter depende del modo: items de búsqueda o
    // hits de resultados.
    const activeLen = getCommandPaletteActiveLength({
      mode,
      itemCount: items.length,
      hitCount: results?.hits.length ?? 0,
    })
    // Escape lo maneja useModalOverlay (ver handleEscape). Acá solo navegación
    // por teclado: flechas para mover el resaltado y Enter para seleccionar.
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => Math.min(activeLen - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (mode === 'results') {
          const hit = results?.hits[focusIdx]
          if (hit) selectHit(hit)
        } else {
          const item = items[focusIdx]
          if (item) selectItem(item)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, items, focusIdx, selectItem, mode, results, selectHit])

  if (!open) return null

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      {/* ω: contenedor full-screen que centra el diálogo con flexbox. El
          centrado va acá y NO en un transform del propio diálogo: la animación
          animate-fade-up del card también usa transform y pisaba el translate
          de centrado (-translate-x/y-1/2), corriendo el modal hacia abajo y a
          la derecha y cortándole el borde inferior. pointer-events-none deja
          pasar el clic al backdrop; el card lo recaptura con
          pointer-events-auto. */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-label="Buscar"
          aria-modal="true"
          className="w-full max-w-xl md:max-w-3xl pointer-events-auto animate-fade-up"
        >
          <div className="bg-paper-50 border border-ink-100/80 rounded-xl shadow-lg shadow-ink-900/15 overflow-hidden">
            {/* σ-followup: kbd visible del atajo arriba derecha del input —
              se movió desde el sidebar trigger. Da sentido ver "⌘ K"
              cuando el modal está abierto: refuerza el atajo en el
              contexto donde aporta. */}
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar o preguntar…"
                className="w-full px-5 py-4 pr-16 bg-transparent text-ink-700 placeholder:text-ink-300 font-serif text-lg leading-none border-b border-ink-100/60"
                autoComplete="off"
              />
              <kbd
                aria-hidden
                className="absolute right-4 top-1/2 -translate-y-1/2 text-micro px-1.5 py-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-400 leading-none font-mono"
              >
                {SHORTCUT_KEY} K
              </kbd>
            </div>
            {mode === 'results' && results ? (
              <>
                <Suspense
                  fallback={
                    <p className="px-5 py-6 text-ink-400 italic text-sm text-center">
                      cargando resultados…
                    </p>
                  }
                >
                  <CommandPaletteResults
                    hits={results.hits}
                    ast={results.ast}
                    source={results.source}
                    heading={results.heading}
                    focusIdx={focusIdx}
                    onFocusIdx={setFocusIdx}
                    onSelectHit={selectHit}
                    onBack={() => {
                      setMode('search')
                      setResults(null)
                      setFocusIdx(0)
                    }}
                    onSave={(name) => {
                      if (results.ast) saveQuery.mutate({ name, query: results.ast })
                    }}
                    saving={saveQuery.isPending}
                  />
                </Suspense>
                <div className="px-5 py-2 border-t border-ink-100/60 text-micro uppercase tracking-eyebrow text-ink-300 flex justify-between">
                  <span>↑↓ navegar · enter abrir · esc volver</span>
                  <span>{results.hits.length} resultados</span>
                </div>
              </>
            ) : (
              <>
                <CommandPaletteSearchMode
                  items={items}
                  query={query}
                  running={running}
                  searching={searching}
                  focusIdx={focusIdx}
                  entitiesForPeek={entitiesForPeek}
                  onFocusIdx={setFocusIdx}
                  onSelectItem={selectItem}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
