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

/** Una fila tiene datos si al menos una celda trae algo (boolean cuenta). */
function rowHasData(values: TemplateFillImportValues): boolean {
  return Object.values(values).some((v) => typeof v === 'boolean' || v.length > 0)
}

function rowsFromCsv(text: string): TemplateFillImportValues[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const headers = rows[0] ?? []

  // El formato de dos columnas `name,value` describe UNA copia, no un lote.
  const nameIndex = headers.findIndex((header) => /^name|nombre|variable$/i.test(header))
  const valueIndex = headers.findIndex((header) => /^value|valor|dato$/i.test(header))
  if (nameIndex >= 0 && valueIndex >= 0) {
    const single = valuesFromCsv(text)
    return Object.keys(single).length > 0 ? [single] : []
  }

  return rows
    .slice(1)
    .map((data) => {
      const values: TemplateFillImportValues = {}
      headers.forEach((header, index) => {
        const name = header.trim()
        if (!name) return
        values[name] = data[index] ?? ''
      })
      return values
    })
    .filter(rowHasData)
}

/**
 * Lote (relleno en serie): varias filas → varias copias de la planilla.
 * Acepta:
 *  - CSV con cabecera de nombres de casillero + UNA FILA POR COPIA.
 *  - JSON: array de objetos `[{campo: valor}, …]` o `{rows: [...]}`.
 *  - Los formatos de copia única (JSON objeto, CSV `name,value`) degeneran a
 *    un lote de 1 — el caller decide si eso es un import normal.
 */
export function parseTemplateFillRows(text: string): TemplateFillImportValues[] {
  const clean = text.trim()
  if (!clean) throw new Error('No se encontraron datos para importar.')

  if (clean.startsWith('[') || clean.startsWith('{')) {
    const parsed = JSON.parse(clean) as unknown
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.rows)
        ? parsed.rows
        : isRecord(parsed)
          ? [isRecord(parsed.values) ? parsed.values : parsed]
          : []
    const rows = list.filter(isRecord).map(valuesFromObject).filter(rowHasData)
    if (rows.length > 0) return rows
  } else {
    const rows = rowsFromCsv(clean)
    if (rows.length > 0) return rows
  }

  throw new Error(
    'No se encontraron filas de datos. El lote espera un CSV con cabecera y una fila por copia.',
  )
}
