import { useState } from 'react'
import { useAISettingsQuery, useSetAITaskProvider } from '../state'
import type { AITaskKey } from '../api'
import { LoadingHint } from './LoadingHint'
// η3 / τ-IA: la lista de modelos por provider vive en src/lib/aiModels.ts —
// fuente de verdad compartida con AIModeToggle (modelo a forzar).
import { MODELS_BY_PROVIDER } from '../lib/aiModels'

const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', notes: 'barato, rápido' },
  { value: 'openai', label: 'OpenAI', notes: 'preciso, visión' },
  { value: 'anthropic', label: 'Anthropic', notes: 'reflexivo, buena prosa' },
  { value: 'gemini', label: 'Gemini', notes: 'gratis hasta cap, visión' },
] as const

const TASKS: Array<{ key: AITaskKey; label: string; hint: string }> = [
  {
    key: 'extract',
    label: 'Extracción de texto',
    hint: 'pegas un párrafo y la IA propone entidades',
  },
  {
    key: 'extract-image',
    label: 'Extracción desde imagen',
    hint: 'OCR + estructura desde foto (requiere visión)',
  },
  {
    key: 'suggest-relationships',
    label: 'Descubrir relaciones',
    hint: 'IA propone vínculos entre entidades existentes',
  },
  {
    key: 'reclassify',
    label: 'Reclasificar',
    hint: 'IA revisa tipos actuales y propone mejores',
  },
  {
    key: 'reflect',
    label: 'Interpretación de cita',
    hint: 'IA escribe una lectura de la cita',
  },
  { key: 'chat', label: 'Chat', hint: 'conversación con tu trama como contexto' },
  {
    key: 'voz',
    label: 'Voz de…',
    hint: 'lectura activa: qué diría una entidad según sus citas',
  },
]

const VISION_REQUIRED: Array<AITaskKey> = ['extract-image']

// Tasks where a second model can review the primary's proposals.
const VERIFIABLE: Array<AITaskKey> = ['reclassify', 'suggest-relationships']

/**
 * Per-task LLM provider configuration. Each task can use a different model.
 * Empty/default means "fall back to AI_PROVIDER (env var)".
 *
 * The verifyWith dropdown (block 2 territory) is not exposed here yet —
 * it'll show up once cross-verification lands so the option appears next
 * to its consumer.
 */
export function AITaskSettings() {
  const settings = useAISettingsQuery()
  const setProvider = useSetAITaskProvider()
  const [busyTask, setBusyTask] = useState<AITaskKey | null>(null)

  if (settings.isLoading) {
    return <LoadingHint text="cargando" />
  }
  if (settings.error || !settings.data) {
    return (
      <p className="text-xs text-[color:var(--accent-clay)]">
        No se pudo cargar la configuración de IA.
      </p>
    )
  }

  async function pick(task: AITaskKey, provider: string) {
    setBusyTask(task)
    try {
      const current = settings.data?.tasks.find((t) => t.task === task)
      await setProvider.mutateAsync({
        task,
        provider,
        // η3: al cambiar de provider, limpiar el model override —
        // un model de deepseek no es válido para openai. El usuario
        // puede re-elegir model después.
        model: null,
        // Keep verifyWith if it's still distinct from the new provider; clear otherwise.
        verifyWith:
          current?.verifyWith && current.verifyWith !== provider
            ? current.verifyWith
            : null,
      })
    } finally {
      setBusyTask(null)
    }
  }

  // η3: cambiar el modelo dentro del provider activo (e.g. DeepSeek V3 → R1).
  async function pickModel(task: AITaskKey, model: string) {
    setBusyTask(task)
    try {
      const current = settings.data?.tasks.find((t) => t.task === task)
      await setProvider.mutateAsync({
        task,
        provider: current?.provider ?? '',
        model: model || null,
        verifyWith: current?.verifyWith ?? null,
      })
    } finally {
      setBusyTask(null)
    }
  }

  async function pickVerifier(task: AITaskKey, verifyWith: string) {
    setBusyTask(task)
    try {
      const current = settings.data?.tasks.find((t) => t.task === task)
      const provider = current?.provider ?? settings.data?.defaultProvider ?? ''
      if (verifyWith && verifyWith === provider) {
        // Don't allow same provider on both sides — front-end safety net.
        return
      }
      await setProvider.mutateAsync({
        task,
        provider: current?.provider ?? '',
        verifyWith: verifyWith || null,
      })
    } finally {
      setBusyTask(null)
    }
  }

  const defaultProvider = settings.data.defaultProvider
  const byTask = new Map(settings.data.tasks.map((t) => [t.task, t]))

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500 leading-relaxed">
        Distintos modelos son buenos en cosas distintas. Aquí eliges qué provider usa cada
        tarea. <em>Default</em> usa el provider general configurado en Netlify (
        <code className="text-micro bg-paper-100 px-1 rounded">{defaultProvider}</code>).
      </p>

      <ul className="divide-y divide-ink-100/60">
        {TASKS.map((task) => {
          const current = byTask.get(task.key)
          const activeProvider = current?.provider ?? defaultProvider
          const requiresVision = VISION_REQUIRED.includes(task.key)
          const verifiable = VERIFIABLE.includes(task.key)
          // η3: lista de modelos del provider activo (si hay rows).
          // Si no hay rows (sin override de provider), no mostramos
          // selector de modelo — el modelo lo dicta el default del
          // provider de Netlify env.
          const activeProvOverride = current?.provider ?? ''
          const modelChoices = activeProvOverride
            ? (MODELS_BY_PROVIDER[activeProvOverride] ?? [])
            : []
          return (
            <li key={task.key} className="py-3 space-y-1.5">
              <div className="flex items-baseline gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-700">{task.label}</div>
                  <div className="text-caption text-ink-400 leading-snug">
                    {task.hint}
                  </div>
                </div>
                <select
                  value={current?.provider ?? ''}
                  onChange={(e) => pick(task.key, e.target.value)}
                  disabled={busyTask === task.key}
                  className="input-paper text-xs py-1 pr-7"
                  style={{ minWidth: '11rem' }}
                >
                  <option value="">default ({defaultProvider})</option>
                  {PROVIDERS.filter(
                    (p) =>
                      !requiresVision || p.value === 'openai' || p.value === 'gemini',
                  ).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} — {p.notes}
                    </option>
                  ))}
                </select>
              </div>
              {/* η3: model picker — aparece solo cuando hay un provider
                  explícito (con default no tiene sentido elegir model). */}
              {modelChoices.length > 1 && (
                <div className="flex items-baseline gap-3 pl-4 border-l-2 border-ink-100/60">
                  <div className="flex-1 text-caption text-ink-400 leading-snug">
                    Modelo dentro de{' '}
                    {PROVIDERS.find((p) => p.value === activeProvOverride)?.label}
                  </div>
                  <select
                    value={current?.model ?? ''}
                    onChange={(e) => pickModel(task.key, e.target.value)}
                    disabled={busyTask === task.key}
                    className="input-paper text-xs py-1 pr-7"
                    style={{ minWidth: '11rem' }}
                  >
                    {modelChoices.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label} — {m.notes}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {verifiable && (
                <div className="flex items-baseline gap-3 pl-4 border-l-2 border-ink-100/60">
                  <div className="flex-1 text-caption text-ink-400 leading-snug">
                    Verificar con un segundo modelo (otro provider revisa cada propuesta y
                    marca dudas)
                  </div>
                  <select
                    value={current?.verifyWith ?? ''}
                    onChange={(e) => pickVerifier(task.key, e.target.value)}
                    disabled={busyTask === task.key}
                    className="input-paper text-xs py-1 pr-7"
                    style={{ minWidth: '11rem' }}
                  >
                    <option value="">sin verificación</option>
                    {PROVIDERS.filter((p) => p.value !== activeProvider).map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
