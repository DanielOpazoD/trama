import { useCallback, useEffect, useState } from 'react'

/**
 * State sincronizado con un query param de la URL.
 *
 * Permite que parte del estado de la app sea **enlazable** — copiar la URL
 * y abrirla en otra ventana reproduce el mismo estado. Para Trama lo
 * usamos para entidades seleccionadas (`?entity=uuid`), de modo que se
 * pueda compartir un link como `https://trama.app/?entity=borges-123`.
 *
 * Diseño:
 *   - Lectura inicial: lee `?key=value` de window.location.
 *   - Escritura: `replaceState` por default (no llena el history al
 *     navegar entre entidades). Configurable a `pushState` para deep-link
 *     real.
 *   - Sincronización con back/forward via popstate listener.
 *   - SSR-safe: si no hay window, devuelve null.
 *
 * No reemplaza a un router — es una primitiva mínima para 1-2 params
 * sin agregar una dependencia de routing.
 */
export function useSearchParamState(
  key: string,
  options: { push?: boolean } = {},
): [string | null, (value: string | null) => void] {
  const { push = false } = options

  const [value, setValueState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get(key)
  })

  const setValue = useCallback(
    (next: string | null) => {
      setValueState(next)
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      if (next) url.searchParams.set(key, next)
      else url.searchParams.delete(key)
      const newUrl = url.toString()
      if (newUrl === window.location.href) return
      if (push) {
        window.history.pushState(null, '', newUrl)
      } else {
        window.history.replaceState(null, '', newUrl)
      }
    },
    [key, push],
  )

  // Sincronización cuando el usuario usa back/forward del browser.
  // El estado React se actualiza desde la URL "externa" en ese caso.
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onPop() {
      const next = new URLSearchParams(window.location.search).get(key)
      setValueState(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [key])

  return [value, setValue]
}
