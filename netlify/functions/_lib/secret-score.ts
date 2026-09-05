export type SecretHealthLevel = 'healthy' | 'watch' | 'high'
export type SecretHealthFlag =
  'vencida' | 'vence-pronto' | 'critica' | 'rotacion-pendiente' | 'sin-rotacion'

export type SecretHealthInput = {
  critical: boolean
  expiresAt?: string | null
  lastRotatedAt?: string | null
  now?: string
}

export type SecretHealth = {
  level: SecretHealthLevel
  score: number
  flags: SecretHealthFlag[]
}

function dayStamp(value: string): number {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return Number.NaN
  return Date.UTC(y, m - 1, d)
}

function daysBetween(from: string, to: string): number {
  return Math.floor((dayStamp(to) - dayStamp(from)) / 86_400_000)
}

export function assessSecretHealth(input: SecretHealthInput): SecretHealth {
  const now = input.now ?? new Date().toISOString().slice(0, 10)
  const flags: SecretHealthFlag[] = []
  let score = 100

  if (input.expiresAt) {
    const daysToExpiry = daysBetween(now, input.expiresAt)
    if (Number.isFinite(daysToExpiry) && daysToExpiry < 0) {
      flags.push('vencida')
      score -= 45
    } else if (Number.isFinite(daysToExpiry) && daysToExpiry <= 30) {
      flags.push('vence-pronto')
      score -= 20
    }
  }

  if (input.critical) {
    flags.push('critica')
    score -= 10
  }

  if (!input.lastRotatedAt) {
    flags.push('sin-rotacion')
    score -= 20
  } else {
    const rotationAge = daysBetween(input.lastRotatedAt, now)
    if (Number.isFinite(rotationAge) && rotationAge > 180) {
      flags.push('rotacion-pendiente')
      score -= 15
    }
  }

  score = Math.max(0, Math.min(100, score))
  const level: SecretHealthLevel =
    score < 60 || flags.includes('vencida') ? 'high' : score < 85 ? 'watch' : 'healthy'

  return { level, score, flags }
}
