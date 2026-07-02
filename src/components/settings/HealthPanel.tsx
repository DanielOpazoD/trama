import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { PanelHeader } from './_shared'
import {
  HealthAlertsList,
  HealthBudgetSection,
  HealthCountsGrid,
  HealthDailyCostSection,
  HealthDiagnosticCard,
  HealthLegacyCutoverSection,
  HealthProviderBreakdown,
  HealthRecentErrorsSection,
} from './HealthPanelSections'
import { buildHealthDiagnostic } from './healthPanelModel'

/**
 * Panel de estado del sistema. Trae todo de /api/health en un solo
 * fetch y lo muestra como bloque. Refresca al abrir Settings.
 *
 * Para ε4: los "errores recientes (7d)" siguen aquí como vista
 * resumida. Si el usuario quiere stack traces completos o histórico
 * más profundo, hay un panel dedicado en LogsPanel.
 */
export function HealthPanel() {
  const [copiedDiagnostic, setCopiedDiagnostic] = useState(false)
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

  async function copyDiagnostic() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(buildHealthDiagnostic(data))
      setCopiedDiagnostic(true)
    } catch {
      setCopiedDiagnostic(false)
    }
  }

  return (
    <section className="space-y-6">
      <PanelHeader
        title="Estado del sistema"
        hint="Gasto IA del mes, conteos, errores recientes. Si algo va raro, mira aquí antes que en cualquier otro lado."
      />

      <HealthDiagnosticCard copiedDiagnostic={copiedDiagnostic} onCopy={copyDiagnostic} />
      <HealthAlertsList alerts={data.alerts} />
      <HealthLegacyCutoverSection data={data} />
      <HealthCountsGrid counts={data.counts} />
      <HealthBudgetSection budget={data.budget} month={data.month} />
      <HealthDailyCostSection dailyCost={data.dailyCost} />
      <HealthProviderBreakdown byProvider={data.byProvider} />
      <HealthRecentErrorsSection
        recentErrors={data.recentErrors}
        isFetching={isFetching}
        onRefresh={() => refetch()}
      />
    </section>
  )
}
