import type { HealthResponse } from '../../api'

export type HealthErrorGroup = {
  functionName: string
  statusCode: number | null
  message: string
  latestAt: string
  count: number
}

export type LegacyCutoverChecklistItem = {
  code: 'strict_auth' | 'legacy_owner_mapping' | 'legacy_inventory'
  status: 'ok' | 'warning' | 'blocked' | 'action'
  label: string
  detail: string
}

export function resolveBudgetTone(pct: number) {
  if (pct < 0.5) {
    return { bg: 'var(--accent-sage-soft)', fg: 'var(--accent-sage)' }
  }
  if (pct < 0.8) {
    return { bg: 'var(--accent-gold-soft)', fg: 'var(--accent-gold)' }
  }
  return { bg: 'rgb(239 68 68 / 0.10)', fg: 'rgb(185 28 28)' }
}

export function buildHealthDiagnostic(data: HealthResponse): string {
  const latestError = data.recentErrors[0]
  return [
    'Trama health diagnostic',
    `generatedAt=${new Date().toISOString()}`,
    `auth=${data.auth.mode}`,
    `clerkConfigured=${data.auth.clerkConfigured}`,
    `legacyFallbackAllowed=${data.auth.legacyFallbackAllowed}`,
    `requestId=${data.operational.requestId}`,
    `databaseReachable=${data.operational.databaseReachable}`,
    `runtimeApiRoutesContract=${data.operational.runtimeApiRoutesContract}`,
    `productionSmokeCommand=${data.operational.productionSmokeCommand}`,
    `legacyDataReassignmentCommand=${data.operational.legacyDataReassignmentCommand}`,
    `logRedaction=${data.operational.logRedaction}`,
    `counts=${data.counts.entities} entities, ${data.counts.quotes} quotes, ${data.counts.relationships} relationships`,
    `aiMonth=${data.month.calls} calls, ${data.month.tokensIn} in, ${data.month.tokensOut} out, ${data.month.costCents} cents`,
    `budget=${Math.round(data.budget.pct * 100)}% (${data.budget.remainingCents}/${data.budget.limitCents} cents remaining)`,
    `embeddingsPending=${data.embeddings.pendingEntities} entities, ${data.embeddings.pendingQuotes} quotes`,
    `alerts=${data.alerts.map((a) => `${a.severity}:${a.code}`).join(',') || 'none'}`,
    latestError
      ? `latestError=${latestError.functionName} ${latestError.statusCode ?? 'NA'} ${latestError.message.slice(0, 160)}`
      : 'latestError=none',
  ].join('\n')
}

export function buildLegacyCutoverChecklist(
  data: HealthResponse,
): LegacyCutoverChecklistItem[] {
  const strictAuthOk =
    data.auth.clerkConfigured &&
    !data.auth.legacyFallbackAllowed &&
    data.auth.mode === 'clerk'
  const ownerMapped = data.auth.legacyOwnerMapped

  return [
    {
      code: 'strict_auth',
      status: strictAuthOk ? 'ok' : 'blocked',
      label: strictAuthOk ? 'Clerk estricto' : 'Fallback legacy activo',
      detail: strictAuthOk
        ? 'Requests sin token no deberían caer a legacy-single-user.'
        : 'Desactiva ALLOW_LEGACY_FALLBACK antes de declarar cutover multiusuario.',
    },
    {
      code: 'legacy_owner_mapping',
      status: ownerMapped ? 'ok' : 'warning',
      label: ownerMapped ? 'Owner histórico mapeado' : 'Owner histórico sin mapeo',
      detail: ownerMapped
        ? 'LEGACY_OWNER_CLERK_ID permite revisar data histórica sin fallback anónimo.'
        : 'Define LEGACY_OWNER_CLERK_ID para revisar legacy-single-user con cuenta Clerk real.',
    },
    {
      code: 'legacy_inventory',
      status: 'action',
      label: 'Inventario legacy read-only',
      detail: data.operational.legacyDataReassignmentCommand,
    },
  ]
}

export function dedupHealthErrors(
  errors: Array<{
    id: string
    functionName: string
    statusCode: number | null
    message: string
    createdAt: string
  }>,
): HealthErrorGroup[] {
  const groups = new Map<string, HealthErrorGroup>()
  for (const error of errors) {
    const key = `${error.functionName}|${error.statusCode ?? 'NA'}|${error.message}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (error.createdAt > existing.latestAt) existing.latestAt = error.createdAt
      continue
    }
    groups.set(key, {
      functionName: error.functionName,
      statusCode: error.statusCode,
      message: error.message,
      latestAt: error.createdAt,
      count: 1,
    })
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.latestAt === b.latestAt) return 0
    return a.latestAt < b.latestAt ? 1 : -1
  })
}
