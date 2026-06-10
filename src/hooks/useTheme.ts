import { useCallback, useLayoutEffect, useState } from 'react'
import { startViewTransition } from '../lib/viewTransition'

/**
 * ν3: tres temas, no dos.
 *
 *   paper → light, blanco/gris neutro (default)
 *   night → dark, papel café-noche, accents cool azulados (era "dark")
 *   vela  → dark cálido, sepias profundos + accents dorados/ámbares — opt-in
 *           para lectura nocturna donde el contraste frío de night cansa.
 *
 * paper aplica ninguna clase en <html>.
 * night aplica clase "dark" (compat con tailwind dark: prefix + CSS existente).
 * vela  aplica clases "dark" Y "theme-vela" (cascada: vela = night con overrides).
 */
export type Theme = 'paper' | 'night' | 'vela'

const STORAGE_KEY = 'trama:theme'

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'paper'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'paper' || stored === 'night' || stored === 'vela') return stored
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'night' : 'paper'
}

/**
 * El `<meta name="theme-color">` de index.html cubre solo el primer paint vía
 * `prefers-color-scheme` (no conoce el tema ELEGIDO: con OS claro + tema Noche
 * la barra del navegador quedaría blanca, y Vela jamás se reflejaría). Acá se
 * sincroniza con el paper-50 real del tema activo, leído de las CSS vars —
 * el chrome del navegador móvil se tiñe del papel de la app.
 */
function syncThemeColorMeta(root: HTMLElement): void {
  const paper = getComputedStyle(root).getPropertyValue('--paper-50').trim()
  if (!paper) return
  // Los meta con [media] de index.html (primer paint) tienen precedencia por
  // orden en el head: al tomar control dinámico se retiran y queda uno solo.
  document
    .querySelectorAll('meta[name="theme-color"][media]')
    .forEach((el) => el.remove())
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  // Las vars guardan el triplete RGB ("250 250 250"); el meta quiere color CSS.
  meta.content = `rgb(${paper})`
}

export function useTheme() {
  const [theme, _setTheme] = useState<Theme>(readInitial)

  // useLayoutEffect (no useEffect): el flushSync de startViewTransition corre
  // los layout effects de forma síncrona, así el flip de clases en <html>
  // queda DENTRO del snapshot y el cambio de tema se funde suave en vez de
  // golpear. En navegadores sin la API el callback corre normal.
  useLayoutEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'night' || theme === 'vela'
    root.classList.toggle('dark', isDark)
    root.classList.toggle('theme-vela', theme === 'vela')
    root.style.colorScheme = isDark ? 'dark' : 'light'
    syncThemeColorMeta(root)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* localStorage may be disabled */
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    startViewTransition(() => _setTheme(next))
  }, [])

  // toggle rota entre los tres temas: paper → night → vela → paper.
  // Conserva el botón existente (luna/sol) — sólo añade un paso adicional.
  const toggle = useCallback(() => {
    startViewTransition(() =>
      _setTheme((t) => (t === 'paper' ? 'night' : t === 'night' ? 'vela' : 'paper')),
    )
  }, [])

  return { theme, setTheme, toggle }
}
