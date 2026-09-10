import {
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

export function useCommandPaletteKeyboard({
  open,
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

  useEffect(() => {
    focusIdxRef.current = focusIdx
  }, [focusIdx])

  useEffect(() => {
    if (!open) return
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
        setFocusIdx((i) =>
          clampCommandPaletteFocusIndex({ focusIdx: i + step, activeLen }),
        )
      } else if (intent === 'ask') {
        askCurrent()
      } else if (mode === 'results') {
        const hit = results?.hits[focusIdx]
        if (hit) selectHit(hit)
      } else if (!settled) {
        // Solo se recuerda abrir: una acción sobre una fila que aún no se ve, no.
        if (intent === 'select') pendingSelect.current = true
      } else {
        const item = items[focusIdx]
        if (!item) return
        if (intent === 'act' && item.kind === 'content' && item.secondary)
          item.secondary.run()
        else selectItem(item)
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
}
