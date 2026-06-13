import { useCallback, useEffect, useState } from 'react'

export const KNOWLEDGE_WORKBENCH_STORAGE_KEY = 'trama:knowledge-workbench:v1'

export function useKnowledgeWorkbench() {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readSelectedIds())

  useEffect(() => {
    writeSelectedIds(selectedIds)
  }, [selectedIds])

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setSelectedIds((current) => current.filter((item) => item !== id))
  }, [])

  const clear = useCallback(() => setSelectedIds([]), [])

  const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds])

  /** Reemplaza la selección completa — usado al abrir un proyecto guardado. */
  const setSelected = useCallback((ids: string[]) => setSelectedIds([...ids]), [])

  return { selectedIds, toggleItem, removeItem, clear, isSelected, setSelected }
}

function readSelectedIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_WORKBENCH_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function writeSelectedIds(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KNOWLEDGE_WORKBENCH_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* storage disabled */
  }
}
