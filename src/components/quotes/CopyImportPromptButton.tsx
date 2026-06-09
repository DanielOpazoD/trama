import { useState } from 'react'
import { QUOTES_IMPORT_PROMPT } from '../../lib/quotesImportPrompt'
import { ClipboardIcon, CheckIcon } from '../Icons'

/**
 * τ-IA: icono sutil que copia al portapapeles un prompt para pedirle a otra
 * IA un JSON de citas importable a Trama. Tras importar el JSON desde
 * Configuración → Datos, las citas (y sus autores) entran de una.
 */
export function CopyImportPromptButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(QUOTES_IMPORT_PROMPT)
      setState('copied')
    } catch {
      setState('error')
    }
    window.setTimeout(() => setState('idle'), 2200)
  }

  const title =
    state === 'copied'
      ? '¡Prompt copiado! Pégalo en otra IA y luego importa el JSON en Configuración → Datos'
      : state === 'error'
        ? 'No se pudo copiar'
        : 'Copiar prompt para generar citas con otra IA'

  return (
    <button
      onClick={copy}
      title={title}
      aria-label="Copiar prompt de importación de citas"
      className="p-1.5 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
    >
      {state === 'copied' ? (
        <CheckIcon size={14} className="text-[color:var(--accent-sage)]" />
      ) : (
        <ClipboardIcon
          size={14}
          className={state === 'error' ? 'text-[color:var(--accent-clay)]' : undefined}
        />
      )}
    </button>
  )
}
