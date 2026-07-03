/**
 * Perfil PROPIO del profesional para rellenar planillas: pares nombre→valor
 * que se escriben una vez (nombre, RUT, registro, teléfono…) y se aplican a
 * cualquier plantilla cuyos casilleros se llamen igual (mismo matching
 * normalizado del import de datos). Persistido en localStorage POR USUARIO.
 *
 * Nunca guarda datos de pacientes: es el perfil de quien llena, y los valores
 * viven sólo en este dispositivo.
 */
import type { TemplateFillImportValues } from './pdfTemplateFillImport'

export type TemplateProfileEntry = { id: string; name: string; value: string }

const STORAGE_PREFIX = 'trama:pdf-studio:fill-profile:'
const MAX_ENTRIES = 24
const MAX_TEXT = 200

export const PROFILE_SUGGESTED_NAMES = [
  'Nombre profesional',
  'RUT',
  'N° de registro',
  'Especialidad',
  'Teléfono',
  'Correo',
  'Dirección de consulta',
]

function storageKey(userKey: string): string {
  return `${STORAGE_PREFIX}${userKey}`
}

function isEntry(value: unknown): value is TemplateProfileEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.value === 'string'
  )
}

export function loadTemplateProfile(userKey: string): TemplateProfileEntry[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userKey))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

export function saveTemplateProfile(
  userKey: string,
  entries: TemplateProfileEntry[],
): void {
  try {
    const clean = entries
      .map((entry) => ({
        id: entry.id,
        name: entry.name.trim().slice(0, MAX_TEXT),
        value: entry.value.slice(0, MAX_TEXT),
      }))
      .slice(0, MAX_ENTRIES)
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(clean))
  } catch {
    // best-effort: sin localStorage el perfil vive sólo en la sesión.
  }
}

/** Valores aplicables del perfil: sólo pares con nombre y valor no vacíos. */
export function profileAsFillValues(
  entries: TemplateProfileEntry[],
): TemplateFillImportValues {
  const values: TemplateFillImportValues = {}
  for (const entry of entries) {
    const name = entry.name.trim()
    if (!name || !entry.value.trim()) continue
    values[name] = entry.value
  }
  return values
}
