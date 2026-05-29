/**
 * η3 / τ-IA: modelos por provider que vale la pena exponer en la UI. La
 * lista NO es exhaustiva — la API acepta cualquier id válido del provider;
 * estos son los que ofrecemos como atajo. El valor "" (string vacío) = el
 * default del provider (lo que dice PROVIDER_DEFAULTS en el backend).
 *
 * Fuente de verdad compartida entre:
 *   - AITaskSettings (modelo por tarea, Configuración)
 *   - AIModeToggle   (modelo a forzar globalmente, popover de la barra)
 */
export type ModelChoice = { value: string; label: string; notes: string }

export const MODELS_BY_PROVIDER: Record<string, ModelChoice[]> = {
  deepseek: [
    { value: '', label: 'V3 (chat) — default', notes: 'rápido, barato' },
    {
      value: 'deepseek-reasoner',
      label: 'R1 (reasoner)',
      notes: 'pensador, mejor para sugerencias sutiles',
    },
  ],
  openai: [
    { value: '', label: 'gpt-4o-mini — default', notes: 'barato, visión' },
    { value: 'gpt-4o', label: 'gpt-4o', notes: 'más preciso, más caro' },
    {
      value: 'gpt-4.1-mini',
      label: 'gpt-4.1-mini',
      notes: 'la generación nueva, similar costo',
    },
    {
      value: 'gpt-5.4-mini',
      label: 'gpt-5.4-mini',
      notes: 'gen 5.4: barato y veloz, con visión',
    },
    { value: 'gpt-5.4', label: 'gpt-5.4', notes: 'gen 5.4: más preciso' },
    { value: 'gpt-5.5', label: 'gpt-5.5', notes: 'lo más capaz, más caro' },
  ],
  anthropic: [
    { value: '', label: 'haiku — default', notes: 'rápido' },
    {
      value: 'claude-sonnet-4-5-20251001',
      label: 'sonnet 4.5',
      notes: 'más reflexivo, más caro',
    },
  ],
  gemini: [
    { value: '', label: 'flash — default', notes: 'gratis hasta cap' },
    { value: 'gemini-2.5-pro', label: 'pro 2.5', notes: 'más capaz, más caro' },
  ],
}
