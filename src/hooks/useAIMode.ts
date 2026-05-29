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
/** Modelo a forzar cuando el modo es forced-<provider>. '' = default del
 *  provider. Vive aparte del modo para no inflar el union de AIMode. */
export const AI_MODEL_STORAGE_KEY = 'trama.aiModel'

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

function readForcedModel(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(AI_MODEL_STORAGE_KEY) ?? ''
}

/** Read the forced model synchronously. '' = use the provider's default. */
export function getForcedModel(): string {
  return readForcedModel()
}

/** Convert a mode (+ optional forced model) to the header the backend reads. */
export function aiModeToHeader(mode: AIMode, model = ''): string {
  if (mode === 'auto') return 'auto'
  if (mode === 'off') return 'off'
  // forced-<provider>          →  forced:<provider>
  // forced-<provider> + model  →  forced:<provider>:<model>
  const provider = mode.slice('forced-'.length)
  return model ? `forced:${provider}:${model}` : `forced:${provider}`
}

const AI_MODE_EVENT = 'trama:ai-mode-changed'

export function useAIMode(): {
  mode: AIMode
  setMode: (next: AIMode) => void
  /** Modelo forzado dentro del provider activo. '' = default del provider. */
  model: string
  setModel: (next: string) => void
} {
  const [mode, setLocalMode] = useState<AIMode>(readMode)
  const [model, setLocalModel] = useState<string>(readForcedModel)

  // Keep this hook in sync with localStorage changes from any tab or any
  // other useAIMode caller in this tab (custom event).
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onChange() {
      setLocalMode(readMode())
      setLocalModel(readForcedModel())
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
    const prev = readMode()
    window.localStorage.setItem(AI_MODE_STORAGE_KEY, next)
    setLocalMode(next)
    // Cambiar de modo/provider invalida el modelo forzado anterior (un
    // modelo de OpenAI no es válido para Gemini). Reset al default.
    if (prev !== next) {
      window.localStorage.setItem(AI_MODEL_STORAGE_KEY, '')
      setLocalModel('')
    }
    window.dispatchEvent(new Event(AI_MODE_EVENT))
  }, [])

  const setModel = useCallback((next: string) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(AI_MODEL_STORAGE_KEY, next)
    setLocalModel(next)
    window.dispatchEvent(new Event(AI_MODE_EVENT))
  }, [])

  return { mode, setMode, model, setModel }
}
