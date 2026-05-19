import { useEffect, useState } from 'react'

export type Theme = 'paper' | 'night'

const STORAGE_KEY = 'trama:theme'

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'paper'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'paper' || stored === 'night') return stored
  // Respect OS preference on first visit.
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'night' : 'paper'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'night') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    root.style.colorScheme = theme === 'night' ? 'dark' : 'light'
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* localStorage may be disabled */
    }
  }, [theme])

  function toggle() {
    setTheme((t) => (t === 'paper' ? 'night' : 'paper'))
  }

  return { theme, setTheme, toggle }
}
