import { type ReactElement, type ReactNode } from 'react'
import { pdfCommandTooltip } from '../../../lib/pdfStudio/commands'
import { previewFontFamily, type PdfFontKind } from '../../../lib/pdfStudio/model'
import {
  BoldIcon,
  CameraIcon,
  ChevronDownIcon,
  CursorIcon,
  DuplicateIcon,
  HighlighterIcon,
  OpacityIcon,
  PlusIcon,
  RotateIcon,
  TextIcon,
  TextSizeIcon,
  TrashIcon,
  ZoomIcon,
} from '../../Icons'
import { OverflowMenu } from '../../OverflowMenu'
import { Tooltip } from '../../Tooltip'
import { clamp, stepBtn, type TextStyle, type Tool } from './editorStyle'

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
  { hex: '#f2c94c', label: 'Amarillo' },
]

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

const SIZE_MIN = 0.012
const SIZE_MAX = 0.14
const SIZE_STEP = 0.004
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

const segGroup =
  'inline-flex shrink-0 items-center gap-0.5 rounded-md bg-ink-100/45 p-0.5'
const segBtnTool = (on: boolean) =>
  `h-7 min-w-7 px-2 rounded inline-flex items-center justify-center transition-colors ${
    on
      ? 'bg-paper-50 shadow-sm text-[color:var(--accent-sage)]'
      : 'text-ink-400 hover:text-ink-700'
  }`
const toolbarGroup =
  'inline-flex shrink-0 items-center gap-0.5 rounded-md bg-paper-50/60 px-1 py-0.5'
const primaryAction =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-700 transition-colors hover:bg-ink-100/60 hover:text-ink-900'
const objectAction =
  'shrink-0 touch-target inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/50 hover:text-ink-800 disabled:opacity-30'
const menuTrigger =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-ink-600 transition-colors hover:bg-ink-100/60 hover:text-ink-900'
const editorMenuLayer = 'z-[80]'
const menuItem =
  'w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink-600 transition-colors hover:bg-ink-100/60 hover:text-ink-800'
const menuItemActive =
  'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function ToolbarGroup({
  label,
  children,
  grow = false,
}: {
  label: string
  children: ReactNode
  grow?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${toolbarGroup} ${grow ? 'ml-auto' : ''}`}
    >
      {children}
    </div>
  )
}

function Hint({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Tooltip content={content} side="bottom">
      {children}
    </Tooltip>
  )
}

function activeMenuItem(on: boolean): string {
  return `${menuItem} ${on ? menuItemActive : ''}`
}

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
    <div className={segGroup} aria-label={label}>
      <span className="pl-1 text-ink-400" aria-hidden>
        {icon}
      </span>
      <Hint content={`${label}: reducir`}>
        <button
          type="button"
          onClick={onDec}
          disabled={decDisabled}
          aria-label={`${label}: reducir`}
          className={stepBtn}
        >
          -
        </button>
      </Hint>
      {onValueClick ? (
        <Hint content="Restablecer">
          <button
            type="button"
            onClick={onValueClick}
            className={`${valueClass} text-center text-caption tabular-nums text-ink-600 hover:text-ink-800`}
          >
            {value}
          </button>
        </Hint>
      ) : (
        <span
          className={`${valueClass} text-center text-caption tabular-nums text-ink-600`}
        >
          {value}
        </span>
      )}
      <Hint content={`${label}: aumentar`}>
        <button
          type="button"
          onClick={onInc}
          disabled={incDisabled}
          aria-label={`${label}: aumentar`}
          className={stepBtn}
        >
          +
        </button>
      </Hint>
    </div>
  )
}

export function EditorToolbar({
  tool,
  onToolChange,
  onAddText,
  onAddImage,
  activeFont,
  activeSize,
  activeBold,
  activeColor,
  activeOpacity,
  activeRotation,
  onApplyStyle,
  hasDuplicableSelection,
  duplicateLabel = 'Duplicar texto',
  onDuplicate,
  hasSelection,
  onDelete,
  zoom,
  onZoomChange,
}: {
  tool: Tool
  onToolChange: (t: Tool) => void
  onAddText: () => void
  onAddImage: () => void
  activeFont: PdfFontKind
  activeSize: number
  activeBold: boolean
  activeColor: string
  activeOpacity: number
  activeRotation: number
  onApplyStyle: (patch: Partial<TextStyle>) => void
  hasDuplicableSelection: boolean
  duplicateLabel?: string
  onDuplicate: () => void
  hasSelection: boolean
  onDelete: () => void
  zoom: number
  onZoomChange: (z: number) => void
}) {
  const isMac = isMacLike()
  const activeFontLabel = FONTS.find((f) => f.key === activeFont)?.label ?? 'Fuente'
  const activeShape = SHAPES.find((s) => s.key === tool)
  const activeColorLabel = COLORS.find((c) => c.hex === activeColor)?.label ?? 'Color'
  const stepSize = (delta: number) =>
    onApplyStyle({ sizeRatio: clamp(activeSize + delta, SIZE_MIN, SIZE_MAX) })
  const stepOpacity = (delta: number) =>
    onApplyStyle({ opacity: clamp(activeOpacity + delta, 0.1, 1) })
  const stepRotation = (delta: number) =>
    onApplyStyle({ rotation: (((activeRotation + delta) % 360) + 360) % 360 })
  const zoomStep = (delta: number) => () =>
    onZoomChange(clamp(Math.round((zoom + delta) * 100) / 100, ZOOM_MIN, ZOOM_MAX))

  return (
    <div
      role="toolbar"
      aria-label="Barra de herramientas de edición del PDF"
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-ink-100/70 bg-paper-100/65 px-2 py-1.5 shadow-sm shadow-ink-900/5 shrink-0"
    >
      <ToolbarGroup label="Herramientas">
        <div className={segGroup}>
          <Hint content="Seleccionar y mover">
            <button
              type="button"
              onClick={() => onToolChange('select')}
              className={segBtnTool(tool === 'select')}
              aria-label="Herramienta seleccionar"
              aria-pressed={tool === 'select'}
            >
              <CursorIcon size={14} />
            </button>
          </Hint>
          <Hint content="Resaltar arrastrando">
            <button
              type="button"
              onClick={() => onToolChange('highlight')}
              className={segBtnTool(tool === 'highlight')}
              aria-label="Herramienta resaltar"
              aria-pressed={tool === 'highlight'}
            >
              <HighlighterIcon size={14} />
            </button>
          </Hint>
        </div>
        <OverflowMenu
          label="Formas"
          width="w-44"
          menuLayerClassName={editorMenuLayer}
          triggerClassName={menuTrigger}
          triggerContent={
            <>
              <span className="inline-flex w-4 justify-center" aria-hidden>
                {activeShape?.glyph ?? SHAPES[0]!.glyph}
              </span>
              <ChevronDownIcon size={12} className="text-ink-300" />
            </>
          }
        >
          {(close) => (
            <>
              {SHAPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={tool === s.key}
                  aria-label={`Herramienta ${s.label}`}
                  onClick={() => {
                    onToolChange(s.key)
                    close()
                  }}
                  className={activeMenuItem(tool === s.key)}
                >
                  <span className="inline-flex w-4 justify-center" aria-hidden>
                    {s.glyph}
                  </span>
                  <span>{s.label}</span>
                </button>
              ))}
            </>
          )}
        </OverflowMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Insertar">
        <Hint content="Agregar un cuadro editable">
          <button
            type="button"
            onClick={onAddText}
            aria-label="Agregar cuadro de texto"
            className={primaryAction}
          >
            <TextIcon size={14} />
          </button>
        </Hint>
        <Hint content="Estampar una imagen sobre la página">
          <button
            type="button"
            onClick={onAddImage}
            aria-label="Estampar imagen"
            className={primaryAction}
          >
            <CameraIcon size={14} />
          </button>
        </Hint>
      </ToolbarGroup>

      <ToolbarGroup label="Estilo">
        <OverflowMenu
          label="Fuente"
          width="w-40"
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
              <span className="sr-only">{activeFontLabel}</span>
              <ChevronDownIcon size={12} className="text-ink-300" />
            </>
          }
        >
          {(close) => (
            <>
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeFont === f.key}
                  aria-label={`Fuente ${f.label}`}
                  onClick={() => {
                    onApplyStyle({ font: f.key })
                    close()
                  }}
                  className={activeMenuItem(activeFont === f.key)}
                  style={{ fontFamily: previewFontFamily(f.key) }}
                >
                  <span>{f.label}</span>
                </button>
              ))}
            </>
          )}
        </OverflowMenu>
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
        <Hint content="Negrita">
          <button
            type="button"
            onClick={() => onApplyStyle({ bold: !activeBold })}
            aria-pressed={activeBold}
            aria-label="Negrita"
            className={`shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${
              activeBold
                ? 'bg-ink-100/60 text-ink-800'
                : 'text-ink-400 hover:bg-ink-100/50 hover:text-ink-700'
            }`}
          >
            <BoldIcon size={14} />
          </button>
        </Hint>
        <OverflowMenu
          label="Color"
          width="w-44"
          menuLayerClassName={editorMenuLayer}
          triggerClassName={menuTrigger}
          triggerContent={
            <>
              <span
                className="h-4 w-4 rounded-full border border-ink-900/15"
                style={{ backgroundColor: activeColor }}
                aria-hidden
              />
              <span className="sr-only">{activeColorLabel}</span>
              <ChevronDownIcon size={12} className="text-ink-300" />
            </>
          }
        >
          {(close) => (
            <>
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeColor === c.hex}
                  aria-label={`Color ${c.label}`}
                  onClick={() => {
                    onApplyStyle({ color: c.hex })
                    close()
                  }}
                  className={activeMenuItem(activeColor === c.hex)}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-ink-900/15"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden
                  />
                  <span>{c.label}</span>
                </button>
              ))}
            </>
          )}
        </OverflowMenu>
        <OverflowMenu
          label="Más funciones"
          width="w-64"
          menuLayerClassName={editorMenuLayer}
          triggerClassName={menuTrigger}
          triggerContent={<PlusIcon size={14} />}
        >
          {() => (
            <div className="space-y-1.5">
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
      </ToolbarGroup>
      <ToolbarGroup label="Objeto">
        <Hint
          content={
            hasDuplicableSelection
              ? pdfCommandTooltip('duplicateAnnotation', isMac)
              : 'Selecciona una anotación para duplicarla'
          }
        >
          <button
            type="button"
            onClick={onDuplicate}
            aria-label={duplicateLabel}
            disabled={!hasDuplicableSelection}
            className={objectAction}
          >
            <DuplicateIcon size={14} />
          </button>
        </Hint>
        <Hint
          content={
            hasSelection
              ? pdfCommandTooltip('deleteAnnotation', isMac)
              : 'Selecciona una anotación para eliminarla'
          }
        >
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar"
            disabled={!hasSelection}
            className={`${objectAction} hover:text-[color:var(--accent-clay)]`}
          >
            <TrashIcon size={14} />
          </button>
        </Hint>
      </ToolbarGroup>

      <ToolbarGroup label="Vista" grow>
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
      </ToolbarGroup>
    </div>
  )
}
