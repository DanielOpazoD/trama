import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { Sparkline } from '../Sparkline'
import { PanelHeader } from './_shared'

/**
 * Panel de estado del sistema. Trae todo de /api/health en un solo
 * fetch y lo muestra como bloque. Refresca al abrir Settings.
 *
 * Para ε4: los "errores recientes (7d)" siguen aquí como vista
 * resumida. Si el usuario quiere stack traces completos o histórico
 * más profundo, hay un panel dedicado en LogsPanel.
 */
export function HealthPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 15_000,
  })

  if (isLoading) {
    return (
      <section>
        <PanelHeader
          title="Estado del sistema"
          hint="Gasto IA del mes, conteos, errores recientes."
        />
        <p className="text-xs text-ink-300 italic">cargando…</p>
      </section>
    )
  }
  if (error || !data) {
    return (
      <section>
        <PanelHeader
          title="Estado del sistema"
          hint="Gasto IA del mes, conteos, errores recientes."
        />
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--accent-clay)]">
            No se pudo cargar el estado del sistema.
          </p>
          <button
            onClick={() => refetch()}
            className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 transition-all"
          >
            reintentar
          </button>
        </div>
      </section>
    )
  }

  const budgetPctDisplay = Math.round(data.budget.pct * 100)
  const budgetEur = (data.budget.limitCents / 100).toFixed(2)
  const monthEur = (data.month.costCents / 100).toFixed(2)
  const remainingEur = (data.budget.remainingCents / 100).toFixed(2)

  const budgetTone =
    data.budget.pct < 0.5
      ? { bg: 'var(--accent-sage-soft)', fg: 'var(--accent-sage)' }
      : data.budget.pct < 0.8
        ? { bg: 'var(--accent-gold-soft)', fg: 'var(--accent-gold)' }
        : { bg: 'rgb(239 68 68 / 0.10)', fg: 'rgb(185 28 28)' }

  return (
    <section className="space-y-6">
      <PanelHeader
        title="Estado del sistema"
        hint="Gasto IA del mes, conteos, errores recientes. Si algo va raro, mira aquí antes que en cualquier otro lado."
      />

      {/* Alertas activas — banners arriba para que sean lo primero que
          se ve cuando hay algo que mirar. Si el array está vacío, no
          se renderiza nada. */}
      {data.alerts.length > 0 && (
        <ul className="space-y-2" aria-label="Alertas activas">
          {data.alerts.map((alert) => (
            <li
              key={alert.code}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
                alert.severity === 'error'
                  ? 'alert-error'
                  : alert.severity === 'warn'
                    ? 'alert-warn'
                    : 'bg-[color:var(--accent-primary-soft)] border-[color:var(--accent-primary-ring)] text-[color:var(--accent-primary)]'
              }`}
            >
              <span
                aria-hidden
                className={`mt-1.5 size-1.5 rounded-full shrink-0 ${
                  alert.severity === 'error'
                    ? 'bg-[color:var(--accent-clay)]'
                    : alert.severity === 'warn'
                      ? 'bg-[color:var(--accent-warn)]'
                      : 'bg-[color:var(--accent-primary)]'
                } ${alert.severity !== 'info' ? 'animate-pulse-subtle' : ''}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight">{alert.label}</div>
                <p className="mt-1 text-xs leading-relaxed opacity-80">{alert.hint}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Counts hero */}
      <div className="grid grid-cols-3 gap-3">
        <CountTile label="Entidades" value={data.counts.entities} />
        <CountTile label="Citas" value={data.counts.quotes} />
        <CountTile label="Relaciones" value={data.counts.relationships} />
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="section-eyebrow">gasto IA este mes</span>
          <span
            className="text-micro uppercase tracking-eyebrow font-medium px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: budgetTone.bg, color: budgetTone.fg }}
          >
            {budgetPctDisplay}% del cap
          </span>
        </div>
        <div className="h-2 rounded-full bg-ink-100/60 overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.min(100, budgetPctDisplay)}%`,
              backgroundColor: budgetTone.fg,
            }}
          />
        </div>
        <div className="flex items-baseline justify-between text-xs text-ink-400 tabular-nums">
          <span>
            <strong className="text-ink-700">USD {monthEur}</strong> usados ·{' '}
            <span className="text-ink-300">USD {budgetEur} cap</span>
          </span>
          <span className="text-ink-300">USD {remainingEur} restantes</span>
        </div>
        <p className="text-micro text-ink-300 tabular-nums">
          {data.month.calls} llamadas · {data.month.tokensIn.toLocaleString('es')} tokens
          in · {data.month.tokensOut.toLocaleString('es')} tokens out
        </p>
      </div>

      {/* Sparkline 30d — la forma del gasto diario. Más informativo que
          el total mensual: ¿gastas parejo, picos puntuales, tendencia? */}
      {data.dailyCost && data.dailyCost.length > 0 && (
        <div className="card-paper p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="section-eyebrow">consumo diario · últimos 30 días</span>
            <span className="text-micro text-ink-300 tabular-nums">
              {data.dailyCost.filter((d) => d.calls > 0).length} días activos
            </span>
          </div>
          <Sparkline
            data={data.dailyCost.map((d) => d.costCents)}
            width={520}
            height={48}
            color="var(--accent-primary)"
            ariaLabel="Consumo de IA por día, últimos 30 días"
          />
          <div className="flex items-baseline justify-between text-micro text-ink-400 tabular-nums">
            <span>hace 30d</span>
            <span>hoy</span>
          </div>
        </div>
      )}

      {/* Provider breakdown */}
      {data.byProvider.length > 0 && (
        <div className="space-y-2">
          <p className="section-eyebrow">por provider / modelo (mes)</p>
          <ul className="space-y-1 card-paper p-3">
            {data.byProvider.map((row) => (
              <li
                key={`${row.provider}-${row.model}`}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="text-ink-600 truncate">
                  <span className="font-medium">{row.provider}</span>
                  <span className="text-ink-400"> · {row.model}</span>
                </span>
                <span className="text-ink-400 tabular-nums shrink-0">
                  {row.calls} · USD {(row.costCents / 100).toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent errors */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="section-eyebrow">errores recientes (7d)</p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
          >
            {isFetching ? 'recargando…' : 'recargar'}
          </button>
        </div>
        {data.recentErrors.length === 0 ? (
          <p className="text-xs text-ink-300 italic">sin errores. nada que mirar.</p>
        ) : (
          <ul className="space-y-1.5">
            {dedupErrors(data.recentErrors).map((g) => (
              <li
                key={`${g.functionName}-${g.message.slice(0, 80)}`}
                className="text-xs space-y-0.5 px-2.5 py-1.5 alert-error rounded"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {g.functionName}
                    {g.statusCode && (
                      <span className="ml-1.5 text-micro opacity-80">
                        [{g.statusCode}]
                      </span>
                    )}
                    {/* ρ-micro: cuando el mismo error repite N veces,
                        mostramos "N×" en vez de N filas idénticas. La
                        última ocurrencia da el contexto temporal. */}
                    {g.count > 1 && (
                      <span className="ml-2 text-micro tabular-nums opacity-70">
                        {g.count}×
                      </span>
                    )}
                  </span>
                  <span className="text-micro tabular-nums shrink-0 opacity-70">
                    {new Date(g.latestAt).toLocaleString('es', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="break-words leading-snug opacity-80">
                  {g.message.slice(0, 240)}
                  {g.message.length > 240 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * ρ-micro: agrupa errores idénticos (mismo functionName + mismo message).
 * Antes una falla recurrente (e.g. el viejo bug del Date.toString)
 * llenaba la lista con 20 entries iguales. Acá las colapsamos en una
 * sola entrada con count + timestamp de la más reciente.
 */
function dedupErrors(
  errors: Array<{
    id: string
    functionName: string
    statusCode: number | null
    message: string
    createdAt: string
  }>,
) {
  type Group = {
    functionName: string
    statusCode: number | null
    message: string
    latestAt: string
    count: number
  }
  const groups = new Map<string, Group>()
  for (const e of errors) {
    // Hash conservador: usa los primeros 200 chars del message para
    // evitar diferencias triviales (timestamps, ids únicos al final).
    const key = `${e.functionName}|${e.statusCode ?? 'NA'}|${e.message.slice(0, 200)}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (e.createdAt > existing.latestAt) existing.latestAt = e.createdAt
    } else {
      groups.set(key, {
        functionName: e.functionName,
        statusCode: e.statusCode,
        message: e.message,
        latestAt: e.createdAt,
        count: 1,
      })
    }
  }
  return Array.from(groups.values()).sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-paper p-4 text-center">
      <div className="text-3xl font-serif text-ink-800 tabular-nums leading-none">
        {value.toLocaleString('es')}
      </div>
      <div className="mt-1.5 section-eyebrow">{label}</div>
    </div>
  )
}
