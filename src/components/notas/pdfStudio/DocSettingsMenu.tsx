import { useEffect, useRef, useState } from 'react'
import { type DocSettings } from '../../../lib/pdfStudio/model'
import { SettingsIcon } from '../../Icons'

const POSITIONS: { key: 'left' | 'center' | 'right'; label: string }[] = [
  { key: 'left', label: 'Izq.' },
  { key: 'center', label: 'Centro' },
  { key: 'right', label: 'Der.' },
]

/**
 * Popover de ajustes a nivel DOCUMENTO (numeración de páginas + marca de agua). Es
 * presentacional: recibe los `settings` actuales y avisa cambios por `onChange`; se
 * aplican al ensamblar (ver `assemble.ts`). Cierra al clic afuera o con Escape.
 */
export function DocSettingsMenu({
  settings,
  onChange,
  disabled,
}: {
  settings: DocSettings | undefined
  onChange: (settings: DocSettings) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pn = settings?.pageNumbers
  const wm = settings?.watermark?.text ?? ''
  const active = !!pn || !!wm.trim()

  const setPageNumbers = (next: DocSettings['pageNumbers']) =>
    onChange({ ...settings, pageNumbers: next })
  const setWatermark = (text: string) =>
    onChange({ ...settings, watermark: text.trim() ? { text } : undefined })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ajustes del documento"
        title="Ajustes del documento (numeración, marca de agua)"
        className="relative inline-flex h-7 w-8 items-center justify-center rounded-md border border-ink-200 text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-100/40 hover:text-ink-800 disabled:opacity-50"
      >
        <SettingsIcon size={14} />
        {active && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--accent-sage)' }}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ajustes del documento"
          className="absolute left-0 z-30 mt-1 w-64 space-y-3 rounded-lg border border-ink-100 bg-paper-50 p-3 shadow-xl shadow-ink-900/15"
        >
          {/* Numeración de páginas */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-caption text-ink-700">
              <input
                type="checkbox"
                checked={!!pn}
                onChange={(e) =>
                  setPageNumbers(e.target.checked ? { position: 'center' } : undefined)
                }
              />
              Numerar páginas
            </label>
            {pn && (
              <div className="flex gap-1 pl-6">
                {POSITIONS.map((p) => {
                  const on = pn.position === p.key
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPageNumbers({ position: p.key })}
                      aria-pressed={on}
                      className={`rounded border px-2 py-0.5 text-micro transition-colors ${
                        on
                          ? 'border-transparent text-paper-50'
                          : 'border-ink-200 text-ink-500 hover:border-ink-300'
                      }`}
                      style={on ? { backgroundColor: 'var(--accent-sage)' } : undefined}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Marca de agua */}
          <div className="space-y-1">
            <label className="block text-caption text-ink-700" htmlFor="pdf-watermark">
              Marca de agua
            </label>
            <input
              id="pdf-watermark"
              type="text"
              value={wm}
              onChange={(e) => setWatermark(e.target.value)}
              placeholder="Ej: BORRADOR"
              className="input-paper w-full rounded-md border border-ink-200 px-2 py-1 text-caption"
            />
          </div>

          <p className="text-micro text-ink-400">Se aplican al exportar el PDF.</p>
        </div>
      )}
    </div>
  )
}
