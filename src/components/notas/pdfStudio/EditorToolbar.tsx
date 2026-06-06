import { type ReactNode } from 'react'
import { previewFontFamily, type PdfFontKind } from '../../../lib/pdfStudio/model'
import {
  BoldIcon,
  CursorIcon,
  DuplicateIcon,
  HighlighterIcon,
  OpacityIcon,
  PlusIcon,
  RotateIcon,
  TextSizeIcon,
  TrashIcon,
  ZoomIcon,
} from '../../Icons'
import { ACCENT, clamp, stepBtn, type TextStyle, type Tool } from './editorStyle'

const FONTS: { key: PdfFontKind; label: string }[] = [
  { key: 'sans', label: 'Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
]
const COLORS: { hex: string; label: string }[] = [
  { hex: '#222222', label: 'Tinta' },
  { hex: '#ffffff', label: 'Papel' },
  { hex: '#b3412c', label: 'Rojo' },
  { hex: '#2f5d8a', label: 'Azul' },
  { hex: '#4b7355', label: 'Verde' },
]

/** Íconos mínimos de formas (no existen en el set general). */
function ShapeGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}
const SHAPES: { key: Tool; label: string; glyph: ReactNode }[] = [
  {
    key: 'rect',
    label: 'Rectángulo',
    glyph: (
      <ShapeGlyph>
        <rect x="3.5" y="5.5" width="13" height="9" rx="1" />
      </ShapeGlyph>
    ),
  },
  {
    key: 'oval',
    label: 'Óvalo',
    glyph: (
      <ShapeGlyph>
        <ellipse cx="10" cy="10" rx="7" ry="5" />
      </ShapeGlyph>
    ),
  },
  {
    key: 'line',
    label: 'Línea',
    glyph: (
      <ShapeGlyph>
        <line x1="4" y1="16" x2="16" y2="4" />
      </ShapeGlyph>
    ),
  },
  {
    key: 'arrow',
    label: 'Flecha',
    glyph: (
      <ShapeGlyph>
        <line x1="4" y1="16" x2="16" y2="4" />
        <path d="M16 4 L11.5 5 M16 4 L15 8.5" />
      </ShapeGlyph>
    ),
  },
]

// Tamaño de letra (fracción del alto de página) y zoom: rangos + pasos.
const SIZE_MIN = 0.012
const SIZE_MAX = 0.14
const SIZE_STEP = 0.004
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

const segGroup =
  'inline-flex shrink-0 items-center gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50'
const segBtn = (on: boolean) =>
  `px-2 py-0.5 rounded text-caption transition-colors ${
    on ? 'bg-paper-50 text-ink-800 shadow-sm' : 'text-ink-400 hover:text-ink-700'
  }`
/** Botón de MODO/herramienta: activo en salvia (es el estado que el usuario debe
 *  ver de un vistazo), a diferencia del segmento de fuente (activo neutro). */
const segBtnTool = (on: boolean) =>
  `px-2 py-0.5 rounded transition-colors ${
    on
      ? 'bg-paper-50 shadow-sm text-[color:var(--accent-sage)]'
      : 'text-ink-400 hover:text-ink-700'
  }`
/** Separador de ZONAS de la barra (herramientas · estilo · objeto · vista). */
const sep = 'h-5 w-px shrink-0 bg-ink-100'

/**
 * Control `−[valor]+` con un ÍCONO que lo identifica (tamaño, opacidad, rotación,
 * zoom) para que no se confundan entre sí. El valor puede ser un botón (p. ej. el
 * zoom, que al tocarlo se restablece).
 */
function Stepper({
  icon,
  label,
  value,
  onDec,
  onInc,
  onValueClick,
  decDisabled,
  incDisabled,
  valueClass = 'w-8',
}: {
  icon: ReactNode
  label: string
  value: string
  onDec: () => void
  onInc: () => void
  onValueClick?: () => void
  decDisabled?: boolean
  incDisabled?: boolean
  valueClass?: string
}) {
  return (
    <div className={segGroup} title={label}>
      <span className="pl-1 text-ink-400" aria-hidden>
        {icon}
      </span>
      <button
        type="button"
        onClick={onDec}
        disabled={decDisabled}
        aria-label={`${label}: reducir`}
        className={stepBtn}
      >
        −
      </button>
      {onValueClick ? (
        <button
          type="button"
          onClick={onValueClick}
          title="Restablecer"
          className={`${valueClass} text-center text-caption tabular-nums text-ink-600 hover:text-ink-800`}
        >
          {value}
        </button>
      ) : (
        <span
          className={`${valueClass} text-center text-caption tabular-nums text-ink-600`}
        >
          {value}
        </span>
      )}
      <button
        type="button"
        onClick={onInc}
        disabled={incDisabled}
        aria-label={`${label}: aumentar`}
        className={stepBtn}
      >
        +
      </button>
    </div>
  )
}

/**
 * Barra de edición del modal: modos de herramienta (seleccionar/resaltar), agregar
 * texto, y el estilo del texto/resaltado (fuente, tamaño, negrita, color, opacidad,
 * rotación), más duplicar/eliminar contextual y el zoom del documento. Es
 * presentacional: recibe el estilo ACTIVO (de la selección o el default) y avisa los
 * cambios por `onApplyStyle`; el estado y las mutaciones viven en `PdfTextEditor`.
 */
export function EditorToolbar({
  tool,
  onToolChange,
  onAddText,
  activeFont,
  activeSize,
  activeBold,
  activeColor,
  activeOpacity,
  activeRotation,
  onApplyStyle,
  hasTextSelected,
  onDuplicate,
  hasSelection,
  onDelete,
  zoom,
  onZoomChange,
}: {
  tool: Tool
  onToolChange: (t: Tool) => void
  onAddText: () => void
  activeFont: PdfFontKind
  activeSize: number
  activeBold: boolean
  activeColor: string
  activeOpacity: number
  activeRotation: number
  onApplyStyle: (patch: Partial<TextStyle>) => void
  /** Hay un TEXTO seleccionado → muestra "Duplicar". */
  hasTextSelected: boolean
  onDuplicate: () => void
  /** Hay una anotación seleccionada (cualquier tipo) → muestra "Eliminar". */
  hasSelection: boolean
  onDelete: () => void
  zoom: number
  onZoomChange: (z: number) => void
}) {
  const stepSize = (delta: number) =>
    onApplyStyle({ sizeRatio: clamp(activeSize + delta, SIZE_MIN, SIZE_MAX) })
  const stepOpacity = (delta: number) =>
    onApplyStyle({ opacity: clamp(activeOpacity + delta, 0.1, 1) })
  const stepRotation = (delta: number) =>
    onApplyStyle({ rotation: (((activeRotation + delta) % 360) + 360) % 360 })
  const zoomStep = (delta: number) => () =>
    onZoomChange(clamp(Math.round((zoom + delta) * 100) / 100, ZOOM_MIN, ZOOM_MAX))

  return (
    // Barra de edición — UNA fila (scroll horizontal si no entra) para no robarle
    // alto al documento.
    <div className="flex flex-nowrap items-center gap-x-2 overflow-x-auto px-3 py-1.5 border-b border-ink-100/70 shrink-0">
      {/* Modos de herramienta */}
      <div className={segGroup}>
        <button
          type="button"
          onClick={() => onToolChange('select')}
          className={segBtnTool(tool === 'select')}
          title="Seleccionar y mover"
          aria-label="Herramienta seleccionar"
          aria-pressed={tool === 'select'}
        >
          <CursorIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => onToolChange('highlight')}
          className={segBtnTool(tool === 'highlight')}
          title="Resaltar (arrastra sobre la página)"
          aria-label="Herramienta resaltar"
          aria-pressed={tool === 'highlight'}
        >
          <HighlighterIcon size={14} />
        </button>
      </div>

      {/* Formas vectoriales (arrastra sobre la página) */}
      <div className={segGroup}>
        {SHAPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onToolChange(s.key)}
            className={segBtnTool(tool === s.key)}
            title={`${s.label} (arrastra sobre la página)`}
            aria-label={`Herramienta ${s.label}`}
            aria-pressed={tool === s.key}
          >
            {s.glyph}
          </button>
        ))}
      </div>

      <button
        onClick={onAddText}
        className="btn-ghost text-xs inline-flex shrink-0 items-center gap-1.5"
      >
        <PlusIcon size={13} /> Agregar texto
      </button>

      <span className={sep} aria-hidden />

      {/* Zona ESTILO — fuente, tamaño, negrita, color, opacidad, rotación */}
      <div className={segGroup}>
        {FONTS.map((f) => (
          <button
            key={f.key}
            onClick={() => onApplyStyle({ font: f.key })}
            className={segBtn(activeFont === f.key)}
            style={{ fontFamily: previewFontFamily(f.key) }}
          >
            {f.label}
          </button>
        ))}
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
      <button
        onClick={() => onApplyStyle({ bold: !activeBold })}
        aria-pressed={activeBold}
        aria-label="Negrita"
        title="Negrita"
        className={`shrink-0 h-7 w-8 inline-flex items-center justify-center rounded-md border transition-colors ${
          activeBold
            ? 'border-ink-300 text-ink-800 bg-ink-100/60'
            : 'border-ink-100 text-ink-400 hover:text-ink-700 hover:border-ink-200'
        }`}
      >
        <BoldIcon size={14} />
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {COLORS.map((c) => {
          const on = activeColor === c.hex
          return (
            <button
              key={c.hex}
              onClick={() => onApplyStyle({ color: c.hex })}
              aria-label={`Color ${c.label}`}
              aria-pressed={on}
              title={c.label}
              className="h-6 w-6 rounded-full border border-ink-900/15 transition-transform duration-150 hover:scale-110"
              style={{
                backgroundColor: c.hex,
                transform: on ? 'scale(1.15)' : undefined,
                boxShadow: on
                  ? `0 0 0 2px rgb(var(--paper-50)), 0 0 0 3.5px ${ACCENT}`
                  : undefined,
              }}
            />
          )
        })}
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

      {/* Zona OBJETO — acciones de la anotación seleccionada (contextual) */}
      {hasSelection && <span className={sep} aria-hidden />}
      {hasTextSelected && (
        <button
          onClick={onDuplicate}
          aria-label="Duplicar texto"
          title="Duplicar texto"
          className="shrink-0 touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/40 transition-colors"
        >
          <DuplicateIcon size={14} />
        </button>
      )}
      {/* Eliminar — cualquier anotación seleccionada */}
      {hasSelection && (
        <button
          onClick={onDelete}
          aria-label="Eliminar"
          title="Eliminar (Supr)"
          className="shrink-0 touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-300 hover:text-[color:var(--accent-clay)] hover:bg-ink-100/40 transition-colors"
        >
          <TrashIcon size={14} />
        </button>
      )}

      <div className="flex-1 min-w-[8px]" />

      {/* Zoom del documento — separado a la derecha */}
      <Stepper
        icon={<ZoomIcon size={14} />}
        label="Zoom del documento"
        value={`${Math.round(zoom * 100)}%`}
        valueClass="w-10"
        onValueClick={() => onZoomChange(1)}
        onDec={zoomStep(-ZOOM_STEP)}
        onInc={zoomStep(ZOOM_STEP)}
        decDisabled={zoom <= ZOOM_MIN}
        incDisabled={zoom >= ZOOM_MAX}
      />
    </div>
  )
}
