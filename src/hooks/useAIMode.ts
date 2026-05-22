import { useCallback, useEffect, useState } from 'react'

/**
 * Global AI activation toggle. Three states:
 *   "auto"     — default. Each AI task uses its configured provider.
 *   "off"      — block all AI calls (the server returns 423).
 *   "forced-<provider>" — override every AI call to use this provider.
 *
 * Stored in localStorage so the choice persists across reloads. The api
 * helper reads it on every request and sends it as the X-AI-Mode header.
 */

export type AIMode =
  | 'auto'
  | 'off'
  | 'forced-deepseek'
  | 'forced-openai'
  | 'forced-anthropic'
  | 'forced-gemini'

export const AI_MODE_STORAGE_KEY = 'trama.aiMode'

const VALID_MODES: ReadonlySet<AIMode> = new Set<AIMode>([
  'auto',
  'off',
  'forced-deepseek',
  'forced-openai',
  'forced-anthropic',
  'forced-gemini',
])

function readMode(): AIMode {
  if (typeof window === 'undefined') return 'auto'
  const raw = window.localStorage.getItem(AI_MODE_STORAGE_KEY)
  if (raw && VALID_MODES.has(raw as AIMode)) return raw as AIMode
  return 'auto'
}

/** Read the current AI mode synchronously. For use outside React (api.ts). */
export function getAIMode(): AIMode {
  return readMode()
}

/** Convert a mode to the header value the backend understands. */
export function aiModeToHeader(mode: AIMode): string {
  if (mode === 'auto') return 'auto'
  if (mode === 'off') return 'off'
  // forced-<provider>  →  forced:<provider>
  return `forced:${mode.slice('forced-'.length)}`
}

const AI_MODE_EVENT = 'trama:ai-mode-changed'

export function useAIMode(): {
  mode: AIMode
  setMode: (next: AIMode) => void
} {
  const [mode, setLocalMode] = useState<AIMode>(readMode)

  // Keep this hook in sync with localStorage changes from any tab or any
  // other useAIMode caller in this tab (custom event).
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onChange() {
      setLocalMode(readMode())
    }
    window.addEventListener('storage', onChange)
    window.addEventListener(AI_MODE_EVENT, onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener(AI_MODE_EVENT, onChange)
    }
  }, [])

  const setMode = useCallback((next: AIMode) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(AI_MODE_STORAGE_KEY, next)
    setLocalMode(next)
    window.dispatchEvent(new Event(AI_MODE_EVENT))
  }, [])

  return { mode, setMode }
}
