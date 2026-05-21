import { useState } from 'react'
import { useAISettingsQuery, useSetAITaskProvider } from '../state'
import type { AITaskKey } from '../api'

const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', notes: 'barato, rápido' },
  { value: 'openai', label: 'OpenAI', notes: 'preciso, visión' },
  { value: 'anthropic', label: 'Anthropic', notes: 'reflexivo, buena prosa' },
  { value: 'gemini', label: 'Gemini', notes: 'gratis hasta cap, visión' },
] as const

const TASKS: Array<{ key: AITaskKey; label: string; hint: string }> = [
  { key: 'extract', label: 'Extracción de texto', hint: 'pegás un párrafo y la IA propone entidades' },
  { key: 'extract-image', label: 'Extracción desde imagen', hint: 'OCR + estructura desde foto (requiere visión)' },
  { key: 'suggest-relationships', label: 'Descubrir relaciones', hint: 'IA propone vínculos entre entidades existentes' },
  { key: 'reclassify', label: 'Reclasificar', hint: 'IA revisa tipos actuales y propone mejores' },
  { key: 'reflect', label: 'Interpretación de cita', hint: 'IA escribe una lectura de la cita' },
  { key: 'chat', label: 'Chat', hint: 'conversación con tu trama como contexto' },
]

const VISION_REQUIRED: Array<AITaskKey> = ['extract-image']

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
    return <p className="text-xs text-ink-300 italic">cargando…</p>
  }
  if (settings.error || !settings.data) {
    return (
      <p className="text-xs text-red-700">
        No se pudo cargar la configuración de IA.
      </p>
    )
  }

  async function pick(task: AITaskKey, provider: string) {
    setBusyTask(task)
    try {
      await setProvider.mutateAsync({ task, provider })
    } finally {
      setBusyTask(null)
    }
  }

  const defaultProvider = settings.data.defaultProvider
  const byTask = new Map(settings.data.tasks.map((t) => [t.task, t]))

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500 leading-relaxed">
        Distintos modelos son buenos en cosas distintas. Aquí elegís qué provider
        usa cada tarea. <em>Default</em> usa el provider general configurado en
        Netlify (<code className="text-[10px] bg-paper-100 px-1 rounded">{defaultProvider}</code>).
      </p>

      <ul className="divide-y divide-ink-100/60">
        {TASKS.map((task) => {
          const current = byTask.get(task.key)
          const requiresVision = VISION_REQUIRED.includes(task.key)
          return (
            <li key={task.key} className="py-2.5 flex items-baseline gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink-700">{task.label}</div>
                <div className="text-[11px] text-ink-400 leading-snug">
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
                {PROVIDERS.filter((p) =>
                  !requiresVision || p.value === 'openai' || p.value === 'gemini',
                ).map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.notes}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
