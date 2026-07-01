import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { QueryHit } from '../../api/query'
import type { Item } from '../../hooks/useCommandSearch'
import {
  clampCommandPaletteFocusIndex,
  type CommandPaletteMode,
} from './commandPaletteModel'

export function useCommandPaletteKeyboard({
  open,
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

  useEffect(() => {
    focusIdxRef.current = focusIdx
  }, [focusIdx])

  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => clampCommandPaletteFocusIndex({ focusIdx: i + 1, activeLen }))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => clampCommandPaletteFocusIndex({ focusIdx: i - 1, activeLen }))
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
  }, [
    activeLen,
    open,
    items,
    focusIdx,
    selectItem,
    mode,
    results,
    selectHit,
    setFocusIdx,
  ])

  useEffect(() => {
    const nextFocusIdx = clampCommandPaletteFocusIndex({
      focusIdx: focusIdxRef.current,
      activeLen,
    })
    if (nextFocusIdx === focusIdxRef.current) return
    setFocusIdx(nextFocusIdx)
  }, [activeLen, setFocusIdx])
}
