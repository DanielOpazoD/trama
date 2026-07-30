/**
 * Tarjeta de métrica: un número y su etiqueta.
 *
 * Antes este gesto estaba implementado cuatro veces —`PromptMetric`,
 * `VaultMetric`, el strip inline de LogsExtractionList y variantes— con cuatro
 * tamaños de número (text-lg/xl/2xl/3xl, todos aliases legacy vetados), dos
 * alineaciones y tres colores de etiqueta. Ninguna diferencia respondía al
 * contenido: era deriva. Una sola pieza, en la escala semántica.
 *
 * `tone="danger"` tiñe el número sólo cuando el valor es mayor que cero: un
 * «0 vencidas» en rojo alarmaría de nada.
 */
export function MetricTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  /** Preformateado cuando hace falta («USD 1,23», «12.345»). */
  value: number | string
  tone?: 'neutral' | 'danger'
}) {
  const alarmado = tone === 'danger' && (typeof value !== 'number' || value > 0)
  return (
    <div className="rounded-lg border border-ink-100/70 bg-paper-50/60 px-3 py-2">
      <div
        className="font-serif text-h2 leading-none text-ink-800 tabular-nums"
        style={alarmado ? { color: 'var(--accent-clay)' } : undefined}
      >
        {value}
      </div>
      <div className="mt-1 text-micro uppercase tracking-eyebrow text-ink-300">
        {label}
      </div>
    </div>
  )
}
