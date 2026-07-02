import type { HealthResponse } from '../../api'
import { Sparkline } from '../Sparkline'
import {
  buildLegacyCutoverChecklist,
  dedupHealthErrors,
  resolveBudgetTone,
  type HealthErrorGroup,
  type LegacyCutoverChecklistItem,
} from './healthPanelModel'

type HealthPanelData = HealthResponse

export function HealthDiagnosticCard({
  copiedDiagnostic,
  onCopy,
}: {
  copiedDiagnostic: boolean
  onCopy: () => void
}) {
  return (
    <div className="card-paper-soft flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="section-eyebrow">diagnóstico operativo</p>
        <p className="mt-1 text-caption text-ink-400 leading-relaxed">
          Snapshot compacto para pegar en un issue, PR o incidente.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {copiedDiagnostic && (
          <span role="status" className="text-micro text-[color:var(--accent-sage)]">
            diagnóstico copiado
          </span>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-800 transition-colors"
        >
          copiar diagnóstico
        </button>
      </div>
    </div>
  )
}

export function HealthAlertsList({ alerts }: { alerts: HealthPanelData['alerts'] }) {
  if (alerts.length === 0) return null
  return (
    <ul className="space-y-2" aria-label="Alertas activas">
      {alerts.map((alert) => (
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
            <div className="text-body font-medium leading-tight">{alert.label}</div>
            <p className="mt-1 text-caption leading-relaxed opacity-80">{alert.hint}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function HealthLegacyCutoverSection({ data }: { data: HealthPanelData }) {
  const checklist = buildLegacyCutoverChecklist(data)
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="section-eyebrow">cutover legacy</span>
        <span className="text-micro uppercase tracking-eyebrow text-ink-300">
          evidencia
        </span>
      </div>
      <ul className="space-y-1.5">
        {checklist.map((item) => (
          <LegacyCutoverRow key={item.code} item={item} />
        ))}
      </ul>
    </div>
  )
}

function LegacyCutoverRow({ item }: { item: LegacyCutoverChecklistItem }) {
  const statusClass =
    item.status === 'ok'
      ? 'border-[color:var(--accent-sage-ring)] bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'
      : item.status === 'blocked'
        ? 'alert-error'
        : item.status === 'warning'
          ? 'alert-warn'
          : 'border-ink-100/70 bg-paper-50 text-ink-500'
  return (
    <li className={`rounded-lg border px-3 py-2 ${statusClass}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-medium leading-tight">{item.label}</span>
        <span className="text-micro uppercase tracking-eyebrow tabular-nums opacity-75">
          {item.status}
        </span>
      </div>
      <p className="mt-1 text-caption leading-relaxed opacity-80">{item.detail}</p>
    </li>
  )
}

export function HealthCountsGrid({ counts }: { counts: HealthPanelData['counts'] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <CountTile label="Entidades" value={counts.entities} />
      <CountTile label="Citas" value={counts.quotes} />
      <CountTile label="Relaciones" value={counts.relationships} />
    </div>
  )
}

export function HealthBudgetSection({
  budget,
  month,
}: {
  budget: HealthPanelData['budget']
  month: HealthPanelData['month']
}) {
  const budgetPctDisplay = Math.round(budget.pct * 100)
  const budgetEur = (budget.limitCents / 100).toFixed(2)
  const monthEur = (month.costCents / 100).toFixed(2)
  const remainingEur = (budget.remainingCents / 100).toFixed(2)
  const budgetTone = resolveBudgetTone(budget.pct)

  return (
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
        {month.calls} llamadas · {month.tokensIn.toLocaleString('es')} tokens in ·{' '}
        {month.tokensOut.toLocaleString('es')} tokens out
      </p>
    </div>
  )
}

export function HealthDailyCostSection({
  dailyCost,
}: {
  dailyCost: HealthPanelData['dailyCost']
}) {
  if (!dailyCost || dailyCost.length === 0) return null
  return (
    <div className="card-paper p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="section-eyebrow">consumo diario · últimos 30 días</span>
        <span className="text-micro text-ink-300 tabular-nums">
          {dailyCost.filter((d) => d.calls > 0).length} días activos
        </span>
      </div>
      <Sparkline
        data={dailyCost.map((d) => d.costCents)}
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
  )
}

export function HealthProviderBreakdown({
  byProvider,
}: {
  byProvider: HealthPanelData['byProvider']
}) {
  if (byProvider.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="section-eyebrow">por provider / modelo (mes)</p>
      <ul className="space-y-1 card-paper p-3">
        {byProvider.map((row) => (
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
  )
}

export function HealthRecentErrorsSection({
  recentErrors,
  isFetching,
  onRefresh,
}: {
  recentErrors: HealthPanelData['recentErrors']
  isFetching: boolean
  onRefresh: () => void
}) {
  const groups = dedupHealthErrors(recentErrors)
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="section-eyebrow">errores recientes (7d)</p>
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          {isFetching ? 'recargando…' : 'recargar'}
        </button>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-ink-300 italic">sin errores. nada que mirar.</p>
      ) : (
        <ul className="space-y-1.5">
          {groups.map((group) => (
            <RecentErrorRow
              key={`${group.functionName}|${group.statusCode ?? 'NA'}|${group.message}`}
              group={group}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function RecentErrorRow({ group }: { group: HealthErrorGroup }) {
  return (
    <li className="text-xs space-y-0.5 px-2.5 py-1.5 alert-error rounded">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">
          {group.functionName}
          {group.statusCode && (
            <span className="ml-1.5 text-micro opacity-80">[{group.statusCode}]</span>
          )}
          {group.count > 1 && (
            <span className="ml-2 text-micro tabular-nums opacity-70">
              {group.count}×
            </span>
          )}
        </span>
        <span className="text-micro tabular-nums shrink-0 opacity-70">
          {new Date(group.latestAt).toLocaleString('es', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <p className="break-words leading-snug opacity-80">
        {group.message.slice(0, 240)}
        {group.message.length > 240 ? '…' : ''}
      </p>
    </li>
  )
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
