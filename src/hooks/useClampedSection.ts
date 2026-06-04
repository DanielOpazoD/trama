import { useEffect, useState } from 'react'

/**
 * Estado de sección que se "clampa" a un fallback cuando la sección actual deja
 * de ser visible — anti-trampa: nunca te deja parado en una sección invisible
 * (p. ej. si la ocultás desde Settings). El `fallback` debe ser siempre visible.
 */
export function useClampedSection<T extends string>(
  initial: T,
  fallback: T,
  isVisible: (s: T) => boolean,
): readonly [T, (s: T) => void] {
  const [section, setSection] = useState<T>(initial)
  const visible = isVisible(section)
  useEffect(() => {
    if (!visible) setSection(fallback)
  }, [visible, fallback])
  return [section, setSection] as const
}
