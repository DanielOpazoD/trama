import { useEffect, useState } from 'react'

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

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'night' || theme === 'vela'
    root.classList.toggle('dark', isDark)
    root.classList.toggle('theme-vela', theme === 'vela')
    root.style.colorScheme = isDark ? 'dark' : 'light'
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* localStorage may be disabled */
    }
  }, [theme])

  // toggle rota entre los tres temas: paper → night → vela → paper.
  // Conserva el botón existente (luna/sol) — sólo añade un paso adicional.
  function toggle() {
    setTheme((t) => (t === 'paper' ? 'night' : t === 'night' ? 'vela' : 'paper'))
  }

  return { theme, setTheme, toggle }
}
