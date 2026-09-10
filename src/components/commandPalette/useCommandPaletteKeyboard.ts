import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { QueryHit } from '../../api/query'
import type { Item } from '../../hooks/useCommandSearch'
import {
  resolveCommandPaletteKey,
  type CommandPaletteKeyTarget,
} from './commandPaletteKeys'
import {
  clampCommandPaletteFocusIndex,
  commandPaletteItemKey,
  type CommandPaletteMode,
} from './commandPaletteModel'

/** Dónde nació la tecla: el campo de búsqueda, otro control de la paleta o ninguno. */
function keyTarget(
  target: EventTarget | null,
  input: HTMLInputElement | null,
): CommandPaletteKeyTarget {
  if (!(target instanceof HTMLElement)) return 'none'
  if (target === input) return 'search'
  return target.closest(
    'button, input, textarea, select, summary, a[href], [contenteditable="true"]',
  )
    ? 'control'
    : 'none'
}

const rowKey = (item: Item | undefined) =>
  item ? `${item.kind}-${commandPaletteItemKey(item)}` : null

export function useCommandPaletteKeyboard({
  open,
  query,
  inputRef,
  askCurrent,
  settled,
  activeLen,
  focusIdx,
  setFocusIdx,
  mode,
  items,
  results,
  selectItem,
  selectHit,
}: {
  open: boolean
  /** Lo escrito: cambiarlo suelta la fila anclada. */
  query: string
  inputRef: RefObject<HTMLInputElement | null>
  askCurrent: () => void
  /** La lista ya corresponde a lo escrito (useDeferredValue la retrasa un render). */
  settled: boolean
  activeLen: number
  focusIdx: number
  setFocusIdx: Dispatch<SetStateAction<number>>
  mode: CommandPaletteMode
  items: Item[]
  results: { hits: QueryHit[] } | null
  selectItem: (item: Item) => void
  selectHit: (hit: QueryHit) => void
}) {
  const focusIdxRef = useRef(focusIdx)
  // Un Enter antes de que la lista alcance lo escrito abría la fila de la
  // búsqueda anterior: con «momentos» recién escrito, «Inicio» (medido en e2e).
  // Se recuerda y se abre en cuanto la lista corresponde a lo escrito.
  const pendingSelect = useRef(false)
  // La fila que el usuario eligió (flechas, ratón o su acción) se sigue por su
  // clave cuando la lista cambia debajo: marcar una tarea la reordena al
  // refrescarse, y una lista que llega tarde empuja las filas. Sin elección, el
  // foco es la primera fila de lo que hay.
  const anchorKey = useRef<string | null>(null)

  useEffect(() => {
    focusIdxRef.current = focusIdx
  }, [focusIdx])

  useEffect(() => {
    anchorKey.current = null
  }, [mode, open, query])

  /** Enfoca la fila que eligió el usuario y la ancla. */
  const focusAt = useCallback(
    (idx: number) => {
      setFocusIdx(idx)
      if (mode === 'search') anchorKey.current = rowKey(items[idx])
    },
    [items, mode, setFocusIdx],
  )

  useEffect(() => {
    if (!open) return
    // La fila de la tecla: la anclada si sigue en la lista; si no, la enfocada.
    const anchoredIndex = (fallback: number) => {
      const key = anchorKey.current
      const idx = key ? items.findIndex((item) => rowKey(item) === key) : -1
      return idx >= 0 ? idx : fallback
    }
    function handler(e: KeyboardEvent) {
      const intent = resolveCommandPaletteKey({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        isComposing: e.isComposing,
        target: keyTarget(e.target, inputRef.current),
      })
      if (!intent) return
      e.preventDefault()
      if (intent === 'next' || intent === 'previous') {
        const step = intent === 'next' ? 1 : -1
        setFocusIdx((current) => {
          const base = mode === 'search' ? anchoredIndex(current) : current
          const next = clampCommandPaletteFocusIndex({ focusIdx: base + step, activeLen })
          if (mode === 'search') anchorKey.current = rowKey(items[next])
          return next
        })
      } else if (intent === 'ask') {
        askCurrent()
      } else if (mode === 'results') {
        const hit = results?.hits[focusIdx]
        if (hit) selectHit(hit)
      } else if (!settled) {
        // Solo se recuerda abrir: una acción sobre una fila que aún no se ve, no.
        if (intent === 'select') pendingSelect.current = true
      } else {
        const item = items[anchoredIndex(focusIdx)]
        if (!item) return
        if (intent === 'act' && item.kind === 'content' && item.secondary) {
          anchorKey.current = rowKey(item)
          item.secondary.run()
        } else selectItem(item)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    activeLen,
    askCurrent,
    focusIdx,
    inputRef,
    items,
    mode,
    open,
    results,
    selectHit,
    selectItem,
    setFocusIdx,
    settled,
  ])

  useEffect(() => {
    if (!open) {
      pendingSelect.current = false
      return
    }
    if (!settled || !pendingSelect.current) return
    pendingSelect.current = false
    const item = items[focusIdxRef.current]
    if (item) selectItem(item)
  }, [items, open, selectItem, settled])

  useEffect(() => {
    const nextFocusIdx = clampCommandPaletteFocusIndex({
      focusIdx: focusIdxRef.current,
      activeLen,
    })
    if (nextFocusIdx === focusIdxRef.current) return
    setFocusIdx(nextFocusIdx)
  }, [activeLen, setFocusIdx])

  // Si la lista cambia en modo búsqueda, el foco acompaña a la fila anclada; si
  // desapareció, se suelta y queda el recorte de arriba.
  useEffect(() => {
    const key = anchorKey.current
    if (!key || mode !== 'search') return
    const idx = items.findIndex((item) => rowKey(item) === key)
    if (idx === -1) anchorKey.current = null
    else if (idx !== focusIdxRef.current) setFocusIdx(idx)
  }, [items, mode, setFocusIdx])

  return { focusAt }
}
