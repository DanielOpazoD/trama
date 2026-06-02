import type { Secret } from '../../api'

export function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function formatShortDate(isoOrDate: string | null): string {
  if (!isoOrDate) return ''
  try {
    const [y, m, d] = isoOrDate.slice(0, 10).split('-').map(Number)
    const date = y && m && d ? new Date(y, m - 1, d) : new Date(isoOrDate)
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export function secretHealth(secret: Secret): {
  level: 'healthy' | 'watch' | 'high'
  score: number
  flags: string[]
} {
  const now = todayLocal()
  let score = 100
  const flags: string[] = []

  if (secret.expiresAt) {
    if (secret.expiresAt < now) {
      flags.push('vencida')
      score -= 45
    } else {
      const days = Math.floor(
        (new Date(secret.expiresAt).getTime() - new Date(now).getTime()) / 86_400_000,
      )
      if (days <= 30) {
        flags.push('vence pronto')
        score -= 20
      }
    }
  }
  if (secret.critical) {
    flags.push('crítica')
    score -= 10
  }
  if (!secret.lastRotatedAt) {
    flags.push('sin rotación')
    score -= 20
  } else {
    const days = Math.floor(
      (new Date(now).getTime() - new Date(secret.lastRotatedAt).getTime()) / 86_400_000,
    )
    if (days > 180) {
      flags.push('rotación pendiente')
      score -= 15
    }
  }

  score = Math.max(0, Math.min(100, score))
  return {
    score,
    flags,
    level:
      score < 60 || flags.includes('vencida') ? 'high' : score < 85 ? 'watch' : 'healthy',
  }
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}
