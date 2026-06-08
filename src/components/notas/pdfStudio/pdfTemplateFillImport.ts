export type TemplateFillImportValue = string | boolean
export type TemplateFillImportValues = Record<string, TemplateFillImportValue>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeImportValue(value: unknown): TemplateFillImportValue | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value
  return null
}

function valuesFromObject(record: Record<string, unknown>): TemplateFillImportValues {
  const values: TemplateFillImportValues = {}
  for (const [key, value] of Object.entries(record)) {
    const name = key.trim()
    const normalized = normalizeImportValue(value)
    if (!name || normalized == null) continue
    values[name] = normalized
  }
  return values
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (!quoted && char === ',') {
      row.push(cell.trim())
      cell = ''
      continue
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell.trim())
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell.trim())
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}

function valuesFromCsv(text: string): TemplateFillImportValues {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return {}

  const headers = rows[0] ?? []
  const nameIndex = headers.findIndex((header) => /^name|nombre|variable$/i.test(header))
  const valueIndex = headers.findIndex((header) => /^value|valor|dato$/i.test(header))

  if (nameIndex >= 0 && valueIndex >= 0) {
    const values: TemplateFillImportValues = {}
    for (const row of rows.slice(1)) {
      const name = row[nameIndex]?.trim()
      if (!name) continue
      values[name] = row[valueIndex] ?? ''
    }
    return values
  }

  const data = rows[1]
  if (!data) return {}
  const values: TemplateFillImportValues = {}
  headers.forEach((header, index) => {
    const name = header.trim()
    if (!name) return
    values[name] = data[index] ?? ''
  })
  return values
}

export function parseTemplateFillValues(text: string): TemplateFillImportValues {
  const clean = text.trim()
  if (!clean) throw new Error('No se encontraron datos para importar.')

  if (clean.startsWith('{')) {
    const parsed = JSON.parse(clean) as unknown
    if (!isRecord(parsed)) throw new Error('No se encontraron datos para importar.')
    const source = isRecord(parsed.values) ? parsed.values : parsed
    const values = valuesFromObject(source)
    if (Object.keys(values).length > 0) return values
  } else {
    const values = valuesFromCsv(clean)
    if (Object.keys(values).length > 0) return values
  }

  throw new Error('No se encontraron datos para importar.')
}
