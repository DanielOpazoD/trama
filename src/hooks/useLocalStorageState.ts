import { useCallback, useState } from 'react'

/**
 * Hook: useState con persistencia transparente en localStorage.
 *
 * Lee el valor inicial del storage (si existe y es válido); cualquier
 * `set` también escribe en storage. SSR-safe (devuelve `initial` si
 * no hay window). Silencia errores de localStorage disabled.
 *
 * Si pasás `validate`, se aplica al raw del storage — útil cuando el
 * type del valor es un union estrecho (ej. 'completo' | 'exploratorio')
 * y querés rechazar valores corruptos del storage.
 *
 * Uso:
 *   const [mode, setMode] = useLocalStorageState(
 *     'trama.graphMode', 'completo',
 *     (raw): raw is GraphMode => raw === 'completo' || raw === 'exploratorio'
 *   )
 *
 * Por qué este patrón: en GraphView teníamos 4 pares idénticos de
 * useState + useEffect / try-catch sobre localStorage. Centralizado.
 */
export function useLocalStorageState<T extends string>(
  key: string,
  initial: T,
  validate?: (raw: string) => raw is T,
): [T, (next: T) => void] {
  const [value, setValueState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return initial
      if (validate && !validate(raw)) return initial
      return raw as T
    } catch {
      return initial
    }
  })

  const setValue = useCallback(
    (next: T) => {
      setValueState(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        /* localStorage disabled */
      }
    },
    [key],
  )

  return [value, setValue]
}

/**
 * Variante para valores nullables — útil cuando el storage entry puede
 * estar ausente (null) o tener un valor string. Permite limpiar el
 * entry pasando null al setter.
 */
export function useLocalStorageNullable(
  key: string,
): [string | null, (next: string | null) => void] {
  const [value, setValueState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  })

  const setValue = useCallback(
    (next: string | null) => {
      setValueState(next)
      try {
        if (next === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, next)
      } catch {
        /* localStorage disabled */
      }
    },
    [key],
  )

  return [value, setValue]
}

/**
 * Variante booleana — el storage entry es '1' / '0'. Útil para flags
 * de "ya viste esto" / "dismissed" / "enabled".
 */
export function useLocalStorageBoolean(
  key: string,
  initial = false,
): [boolean, (next: boolean) => void] {
  const [value, setValueState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return initial
      return raw === '1'
    } catch {
      return initial
    }
  })

  const setValue = useCallback(
    (next: boolean) => {
      setValueState(next)
      try {
        window.localStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* localStorage disabled */
      }
    },
    [key],
  )

  return [value, setValue]
}
