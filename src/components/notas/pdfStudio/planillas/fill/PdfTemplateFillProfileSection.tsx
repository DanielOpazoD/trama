import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../../../../IconButton'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import {
  loadTemplateProfile,
  PROFILE_SUGGESTED_NAMES,
  profileAsFillValues,
  saveTemplateProfile,
  type TemplateProfileEntry,
} from './pdfTemplateProfile'

/**
 * «Mis datos»: perfil propio del profesional en el panel de relleno. Se
 * escribe una vez y se aplica a cualquier copia cuyos casilleros se llamen
 * igual (matching normalizado del import). Vive en este dispositivo y nunca
 * guarda datos de pacientes.
 */
export function PdfTemplateFillProfileSection({
  userKey,
  onApply,
}: {
  userKey: string
  /** Aplica valores por nombre (mismo camino que importar datos); devuelve
   *  cuántos campos se completaron. */
  onApply: (values: TemplateFillImportValues) => number
}) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<TemplateProfileEntry[]>(() =>
    loadTemplateProfile(userKey),
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true
      return
    }
    saveTemplateProfile(userKey, entries)
  }, [entries, userKey])

  const applicable = Object.keys(profileAsFillValues(entries)).length

  function patchEntry(id: string, patch: Partial<TemplateProfileEntry>) {
    setEntries((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }

  function addEntry() {
    const used = new Set(entries.map((entry) => entry.name))
    const name = PROFILE_SUGGESTED_NAMES.find((candidate) => !used.has(candidate)) ?? ''
    setEntries((list) => [...list, { id: crypto.randomUUID(), name, value: '' }])
  }

  function applyProfile() {
    const applied = onApply(profileAsFillValues(entries))
    setFeedback(
      applied > 0
        ? `${applied} ${applied === 1 ? 'campo completado' : 'campos completados'} con tu perfil.`
        : 'Ningún casillero de esta planilla se llama como tus datos.',
    )
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Tus datos de siempre (nombre, RUT, registro…), guardados en este dispositivo"
        className="w-full rounded-md border border-ink-200 bg-paper-50 px-2 py-1.5 text-left text-caption font-medium text-ink-700 transition-colors hover:border-[color:var(--accent-sage)]/40 hover:text-[color:var(--accent-sage)]"
      >
        Mis datos {applicable > 0 ? `(${applicable})` : ''}
        <span className="float-right text-ink-400">{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="mt-1.5 rounded-md border border-ink-100 bg-ink-50/50 p-2">
          <p className="text-micro leading-snug text-ink-400">
            Tus datos de profesional, una sola vez. Se aplican a los casilleros que se
            llamen igual. Se guardan solo en este dispositivo — nunca guardes aquí datos
            de pacientes.
          </p>
          <div className="mt-1.5 flex flex-col gap-1">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-1">
                <input
                  type="text"
                  aria-label="Nombre del dato"
                  placeholder="Nombre del casillero"
                  value={entry.name}
                  list="template-profile-name-suggestions"
                  onChange={(event) =>
                    patchEntry(entry.id, { name: event.currentTarget.value })
                  }
                  className="input-paper w-2/5 min-w-0 rounded-md border border-ink-200 px-1.5 py-1 text-caption text-ink-800 placeholder:text-ink-300"
                />
                <input
                  type="text"
                  aria-label={`Valor de ${entry.name || 'dato'}`}
                  placeholder="Valor"
                  value={entry.value}
                  onChange={(event) =>
                    patchEntry(entry.id, { value: event.currentTarget.value })
                  }
                  className="input-paper min-w-0 flex-1 rounded-md border border-ink-200 px-1.5 py-1 text-caption text-ink-800 placeholder:text-ink-300"
                />
                <IconButton
                  label={`Quitar ${entry.name || 'dato'}`}
                  onClick={() =>
                    setEntries((list) => list.filter((item) => item.id !== entry.id))
                  }
                  className="h-6 w-6 shrink-0 rounded text-ink-400 hover:bg-ink-100/70 hover:text-[color:var(--accent-clay)]"
                >
                  <span aria-hidden="true">×</span>
                </IconButton>
              </div>
            ))}
          </div>
          <datalist id="template-profile-name-suggestions">
            {PROFILE_SUGGESTED_NAMES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={addEntry}
              className="rounded-md border border-ink-200 bg-paper-50 px-2 py-1 text-caption font-medium text-ink-600 transition-colors hover:border-[color:var(--accent-sage)]/40 hover:text-[color:var(--accent-sage)]"
            >
              Agregar dato
            </button>
            <button
              type="button"
              onClick={applyProfile}
              disabled={applicable === 0}
              className="flex-1 rounded-md border border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/55 px-2 py-1 text-caption font-semibold text-[color:var(--accent-sage)] transition-colors hover:bg-[color:var(--accent-sage-soft)] disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-300"
            >
              Aplicar a esta copia
            </button>
          </div>
          {feedback ? (
            <p
              role="status"
              className="mt-1.5 rounded-md bg-[color:var(--accent-sage-soft)] px-2 py-1 text-micro text-[color:var(--accent-sage)]"
            >
              {feedback}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
