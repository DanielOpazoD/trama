export type MediaGroupingDirective = 'auto' | 'new' | 'append'

export type WhatsAppMediaDirectives = {
  body: string
  explicitCapturedAt: string | null
  dateLabel: string | null
  grouping: MediaGroupingDirective
}

const MONTHS: ReadonlyMap<string, number> = new Map([
  ['enero', 1],
  ['ene', 1],
  ['febrero', 2],
  ['feb', 2],
  ['marzo', 3],
  ['mar', 3],
  ['abril', 4],
  ['abr', 4],
  ['mayo', 5],
  ['may', 5],
  ['junio', 6],
  ['jun', 6],
  ['julio', 7],
  ['jul', 7],
  ['agosto', 8],
  ['ago', 8],
  ['septiembre', 9],
  ['setiembre', 9],
  ['sept', 9],
  ['sep', 9],
  ['octubre', 10],
  ['oct', 10],
  ['noviembre', 11],
  ['nov', 11],
  ['diciembre', 12],
  ['dic', 12],
] as const)

const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function buildDate(year: number, month: number, day: number) {
  if (!isValidDateParts(year, month, day)) return null
  return {
    capturedAt: `${year}-${pad2(month)}-${pad2(day)}T12:00:00.000`,
    label: `${day} ${MONTH_LABELS[month - 1]} ${year}`,
  }
}

function parseDateValue(raw: string): { capturedAt: string; label: string } | null {
  const value = fold(raw).replace(/\s+/g, ' ')

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value)
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value)
  if (numeric) {
    return buildDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]))
  }

  const textual = /^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})$/.exec(value)
  if (textual) {
    const month = MONTHS.get(textual[2]!)
    if (!month) return null
    return buildDate(Number(textual[3]), month, Number(textual[1]))
  }

  return null
}

function parseDateSegment(segment: string): {
  consumed: boolean
  capturedAt: string | null
  label: string | null
} {
  const match = /^fecha\s*:?\s+(.+)$/i.exec(segment.trim())
  if (!match) return { consumed: false, capturedAt: null, label: null }
  const parsed = parseDateValue(match[1]!)
  if (!parsed) return { consumed: false, capturedAt: null, label: null }
  return { consumed: true, capturedAt: parsed.capturedAt, label: parsed.label }
}

function parseGroupingSegment(segment: string): MediaGroupingDirective | null {
  const value = fold(segment).replace(/\s+/g, ' ')
  if (
    /^(nuevo|nueva|separado|separada|otra escena|otro momento|nueva captura)$/.test(
      value,
    ) ||
    /^no\s+(juntar|agrupar|unir)$/.test(value)
  ) {
    return 'new'
  }
  if (
    /^(juntar|agregar|sumar|anexar)$/.test(value) ||
    /^(juntar|agregar|sumar|anexar)\s+(al|a lo)\s+anterior$/.test(value)
  ) {
    return 'append'
  }
  return null
}

export function parseWhatsAppMediaDirectives(body: string): WhatsAppMediaDirectives {
  const original = body.trim()
  if (!original) {
    return {
      body: '',
      explicitCapturedAt: null,
      dateLabel: null,
      grouping: 'auto',
    }
  }

  const kept: string[] = []
  let consumed = false
  let explicitCapturedAt: string | null = null
  let dateLabel: string | null = null
  let grouping: MediaGroupingDirective = 'auto'

  for (const segment of original.split(/\s*(?:[.;\n]+)\s*/)) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    const date = parseDateSegment(trimmed)
    if (date.consumed) {
      consumed = true
      explicitCapturedAt = date.capturedAt
      dateLabel = date.label
      continue
    }

    const group = parseGroupingSegment(trimmed)
    if (group) {
      consumed = true
      grouping = group
      continue
    }

    kept.push(trimmed)
  }

  return {
    body: consumed ? kept.join('. ').trim() : original,
    explicitCapturedAt,
    dateLabel,
    grouping,
  }
}
