import {
  previewFontFamily,
  type PdfFontKind,
} from '../../../../lib/pdfStudio/model/model'
import {
  BoldIcon,
  ChevronDownIcon,
  ItalicIcon,
  OpacityIcon,
  RotateIcon,
  TextSizeIcon,
} from '../../../Icons'
import { OverflowMenu } from '../../../OverflowMenu'
import { clamp, type TextStyle } from './editorStyle'
import {
  activeMenuItem,
  ColorSwatch,
  COLORS,
  editorMenuLayer,
  focusRing,
  FONTS,
  menuTrigger,
  Stepper,
} from './EditorToolbarPrimitives'

const SIZE_MIN = 0.012
const SIZE_MAX = 0.14
const SIZE_STEP = 0.004

/** Menú único "Texto": agrupa fuente, tamaño, negrita, color, opacidad y rotación
 *  detrás de un solo botón, para que la barra no se llene de controles de estilo. */
export function EditorToolbarStyleMenu({
  activeFont,
  activeSize,
  activeBold,
  activeItalic,
  activeColor,
  activeOpacity,
  activeRotation,
  onApplyStyle,
}: {
  activeFont: PdfFontKind
  activeSize: number
  activeBold: boolean
  activeItalic: boolean
  activeColor: string
  activeOpacity: number
  activeRotation: number
  onApplyStyle: (patch: Partial<TextStyle>) => void
}) {
  const stepSize = (delta: number) =>
    onApplyStyle({ sizeRatio: clamp(activeSize + delta, SIZE_MIN, SIZE_MAX) })
  const stepOpacity = (delta: number) =>
    onApplyStyle({ opacity: clamp(activeOpacity + delta, 0.1, 1) })
  const stepRotation = (delta: number) =>
    onApplyStyle({ rotation: (((activeRotation + delta) % 360) + 360) % 360 })

  return (
    <OverflowMenu
      label="Texto"
      width="w-60"
      menuLayerClassName={editorMenuLayer}
      triggerClassName={menuTrigger}
      triggerContent={
        <>
          <span
            className="text-caption font-semibold"
            style={{ fontFamily: previewFontFamily(activeFont) }}
          >
            Aa
          </span>
          <span
            className="h-3.5 w-3.5 rounded-full border border-ink-900/15"
            style={{ backgroundColor: activeColor }}
            aria-hidden
          />
          <ChevronDownIcon size={12} className="text-ink-300" />
        </>
      }
    >
      {() => (
        <div className="space-y-2">
          <div>
            <p className="px-1 pb-1 text-micro uppercase tracking-eyebrow text-ink-300">
              Fuente
            </p>
            <div className="grid grid-cols-3 gap-1">
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeFont === f.key}
                  aria-label={`Fuente ${f.label}`}
                  onClick={() => onApplyStyle({ font: f.key })}
                  className={`${activeMenuItem(activeFont === f.key)} justify-center`}
                  style={{ fontFamily: previewFontFamily(f.key) }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <Stepper
            icon={<TextSizeIcon size={14} />}
            label="Tamaño de letra"
            value={String(Math.round(activeSize * 792))}
            valueClass="w-7"
            onDec={() => stepSize(-SIZE_STEP)}
            onInc={() => stepSize(SIZE_STEP)}
            decDisabled={activeSize <= SIZE_MIN + 1e-6}
            incDisabled={activeSize >= SIZE_MAX - 1e-6}
          />

          <div className="grid grid-cols-2 gap-2 px-1">
            <button
              type="button"
              onClick={() => onApplyStyle({ bold: !activeBold })}
              aria-pressed={activeBold}
              aria-label="Negrita"
              className={`h-7 inline-flex items-center justify-center gap-1 rounded-md text-caption transition-colors ${focusRing} ${
                activeBold
                  ? 'bg-ink-100/60 text-ink-800'
                  : 'text-ink-400 hover:bg-ink-100/50 hover:text-ink-700'
              }`}
            >
              <BoldIcon size={14} /> Negrita
            </button>
            <button
              type="button"
              onClick={() => onApplyStyle({ italic: !activeItalic })}
              aria-pressed={activeItalic}
              aria-label="Cursiva"
              className={`h-7 inline-flex items-center justify-center gap-1 rounded-md text-caption transition-colors ${focusRing} ${
                activeItalic
                  ? 'bg-ink-100/60 text-ink-800'
                  : 'text-ink-400 hover:bg-ink-100/50 hover:text-ink-700'
              }`}
            >
              <ItalicIcon size={14} /> Cursiva
            </button>
          </div>

          <div>
            <p className="px-1 pb-1 text-micro uppercase tracking-eyebrow text-ink-300">
              Color
            </p>
            <div className="flex flex-wrap gap-1 px-1">
              {COLORS.map((c) => (
                <ColorSwatch
                  key={c.hex}
                  color={c.hex}
                  label={c.label}
                  active={activeColor === c.hex}
                  onSelect={() => onApplyStyle({ color: c.hex })}
                  radio
                />
              ))}
            </div>
          </div>

          <Stepper
            icon={<OpacityIcon size={14} />}
            label="Opacidad"
            value={`${Math.round(activeOpacity * 100)}%`}
            valueClass="w-9"
            onDec={() => stepOpacity(-0.1)}
            onInc={() => stepOpacity(0.1)}
            decDisabled={activeOpacity <= 0.1 + 1e-6}
            incDisabled={activeOpacity >= 1 - 1e-6}
          />
          <Stepper
            icon={<RotateIcon size={14} />}
            label="Rotación del texto"
            value={`${activeRotation}°`}
            valueClass="w-8"
            onDec={() => stepRotation(-15)}
            onInc={() => stepRotation(15)}
          />
        </div>
      )}
    </OverflowMenu>
  )
}
