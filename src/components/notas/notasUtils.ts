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

/** Lunes (hora LOCAL) de la semana de `date` (hoy por defecto), como 'YYYY-MM-DD'. */
export function weekStartLocal(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = (d.getDay() + 6) % 7 // 0 = lunes … 6 = domingo
  d.setDate(d.getDate() - dow)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Suma `n` días a un 'YYYY-MM-DD' y devuelve otro 'YYYY-MM-DD' (local). */
function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const date = new Date(y || 1970, (m || 1) - 1, (d || 1) + n)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

/** Rango legible de la semana cuyo lunes es `weekStart`: "3 – 9 jun" / "29 may – 4 jun". */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6)
  const [, sm] = weekStart.split('-').map(Number)
  const [, em] = end.split('-').map(Number)
  const startTxt =
    sm === em ? String(Number(weekStart.split('-')[2])) : formatShortDate(weekStart)
  return `${startTxt} – ${formatShortDate(end)}`
}

/** 'YYYY-MM-DD' → Date local (sin desfase de zona). */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

/**
 * Rango largo de la semana, pensado para el TÍTULO del cuadro:
 * "1 – 7 de junio" (mismo mes) · "29 de mayo – 4 de junio" (cruza meses).
 */
export function formatWeekRangeLong(weekStart: string): string {
  const start = dateFromKey(weekStart)
  const end = dateFromKey(addDays(weekStart, 6))
  const month = (d: Date) => d.toLocaleDateString('es', { month: 'long' })
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} de ${month(end)}`
  }
  return `${start.getDate()} de ${month(start)} – ${end.getDate()} de ${month(end)}`
}

/** Etiqueta relativa de una semana: "Esta semana" / "Semana pasada" / "Próxima semana" / "". */
export function relativeWeekLabel(weekStart: string, today: Date = new Date()): string {
  const current = weekStartLocal(today)
  if (weekStart === current) return 'Esta semana'
  if (weekStart === addDays(current, -7)) return 'Semana pasada'
  if (weekStart === addDays(current, 7)) return 'Próxima semana'
  return ''
}

/** Los lunes (week_start, 'YYYY-MM-DD') de cada semana que empieza en ese mes. */
export function mondaysOfMonth(year: number, month0: number): string[] {
  const keys: string[] = []
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month0, d)
    if ((date.getDay() + 6) % 7 === 0) keys.push(weekStartLocal(date))
  }
  return keys
}

/** Nombre del mes (es) para un índice 0–11, capitalizado: "junio". */
export function monthName(month0: number): string {
  const d = new Date(2020, month0, 1)
  return d.toLocaleDateString('es', { month: 'long' })
}

/** Año y mes (0–11) a los que pertenece una semana, según su lunes. */
export function weekYearMonth(weekStart: string): { year: number; month0: number } {
  const [y, m] = weekStart.split('-').map(Number)
  return { year: y || 1970, month0: (m || 1) - 1 }
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
