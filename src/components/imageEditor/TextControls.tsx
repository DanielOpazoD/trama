import type {
  TextColor,
  TextFont,
  TextLayer,
  TextSize,
} from '../../lib/imageEditor/types'
import { fontFamilyFor } from '../../lib/imageEditor/transforms'
import { BoldIcon, TrashIcon } from '../Icons'

const FONTS: { key: TextFont; label: string }[] = [
  { key: 'sans', label: 'Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'cursive', label: 'Manuscrita' },
]
const SIZES: TextSize[] = ['S', 'M', 'L']
const COLORS: { key: TextColor; label: string; css: string }[] = [
  { key: 'ink', label: 'Tinta', css: 'rgb(var(--ink-800))' },
  { key: 'paper', label: 'Papel', css: 'rgb(var(--paper-50))' },
  { key: 'accent', label: 'Acento', css: 'rgb(var(--accent-primary))' },
]

const segBtn = (on: boolean) =>
  `px-2 py-0.5 rounded text-caption transition-colors ${
    on ? 'bg-paper-50 text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-700'
  }`
const segGroup =
  'inline-flex gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50'

/** Panel de edición del texto seleccionado: contenido, fuente, tamaño, negrita, color. */
export function TextControls({
  layer,
  onChange,
  onRemove,
}: {
  layer: TextLayer
  onChange: (patch: Partial<TextLayer>) => void
  onRemove: () => void
}) {
  return (
    <div className="card-paper-soft rounded-lg p-3 space-y-2.5">
      <input
        value={layer.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Tu texto…"
        aria-label="Texto"
        className="input-paper w-full text-body"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Fuente" className={segGroup}>
          {FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={layer.font === f.key}
              aria-label={`Fuente ${f.label}`}
              onClick={() => onChange({ font: f.key })}
              style={{ fontFamily: fontFamilyFor(f.key) }}
              className={segBtn(layer.font === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Tamaño" className={segGroup}>
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={layer.size === s}
              aria-label={`Tamaño ${s}`}
              onClick={() => onChange({ size: s })}
              className={segBtn(layer.size === s)}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onChange({ bold: !layer.bold })}
          aria-label="Negrita"
          aria-pressed={layer.bold}
          title="Negrita"
          className={`touch-target p-1.5 rounded-md border transition-colors ${
            layer.bold
              ? 'border-ink-400 text-ink-700 bg-ink-100'
              : 'border-ink-100 text-ink-400 hover:text-ink-700'
          }`}
        >
          <BoldIcon size={13} />
        </button>

        <div
          role="radiogroup"
          aria-label="Color"
          className="inline-flex items-center gap-1.5"
        >
          {COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={layer.color === c.key}
              aria-label={`Color ${c.label}`}
              title={c.label}
              onClick={() => onChange({ color: c.key })}
              className="size-6 rounded-full border transition-transform hover:scale-110"
              style={{
                backgroundColor: c.css,
                borderColor: 'rgb(var(--ink-200))',
                boxShadow:
                  layer.color === c.key
                    ? '0 0 0 2px rgb(var(--paper-50)), 0 0 0 3.5px rgb(var(--accent-primary))'
                    : 'none',
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar texto"
          title="Quitar texto"
          className="touch-target ml-auto p-1.5 rounded-md text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
  )
}
