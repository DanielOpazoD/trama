import { useState } from 'react'
import { QUOTES_IMPORT_PROMPT } from '../../lib/quotesImportPrompt'

/**
 * τ-IA: copia al portapapeles un prompt para pedirle a otra IA un JSON de
 * citas importable a Trama. Vive en el header de Citas. Tras importar el
 * JSON resultante desde Configuración → Datos, las citas (y sus autores)
 * entran de una.
 */
export function CopyImportPromptButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(QUOTES_IMPORT_PROMPT)
      setState('copied')
    } catch {
      // Contexto sin Clipboard API (raro en https/localhost) — avisamos.
      setState('error')
    }
    window.setTimeout(() => setState('idle'), 2200)
  }

  return (
    <button
      onClick={copy}
      title="Copia un prompt para pedirle a otra IA un JSON de citas listo para importar (Configuración → Datos)"
      className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
    >
      {state === 'copied'
        ? '¡copiado!'
        : state === 'error'
          ? 'no se pudo'
          : 'Copiar prompt'}
    </button>
  )
}
