import { type ReactElement, type ReactNode } from 'react'
import { type PdfFontKind } from '../../../lib/pdfStudio/model'
import { Tooltip } from '../../Tooltip'
import { stepBtn, type Tool } from './editorStyle'

export const FONTS: { key: PdfFontKind; label: string }[] = [
  { key: 'sans', label: 'Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
]

export const COLORS: { hex: string; label: string }[] = [
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

export const SHAPES: { key: Tool; label: string; glyph: ReactNode }[] = [
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

export const segGroup =
  'inline-flex shrink-0 items-center gap-0.5 rounded-md bg-ink-100/45 p-0.5'

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-sage)] focus-visible:ring-offset-1 focus-visible:ring-offset-paper-50'

export const segBtnTool = (on: boolean) =>
  `h-7 min-w-7 px-2 rounded inline-flex items-center justify-center transition-colors ${focusRing} ${
    on
      ? 'bg-paper-50 shadow-sm text-[color:var(--accent-sage)]'
      : 'text-ink-400 hover:text-ink-700'
  }`

export const primaryAction = `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-700 transition-colors hover:bg-ink-100/60 hover:text-ink-900 ${focusRing}`

export const objectAction = `shrink-0 touch-target inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/50 hover:text-ink-800 disabled:opacity-30 ${focusRing}`

export const menuTrigger = `inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-ink-600 transition-colors hover:bg-ink-100/60 hover:text-ink-900 ${focusRing}`

export const editorMenuLayer = 'z-[80]'

const toolbarGroup =
  'inline-flex shrink-0 items-center gap-0.5 rounded-md bg-paper-50/60 px-1 py-0.5'

const menuItem =
  'w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink-600 transition-colors hover:bg-ink-100/60 hover:text-ink-800'

const menuItemActive =
  'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'

export function ToolbarGroup({
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

export function Hint({
  content,
  children,
}: {
  content: ReactNode
  children: ReactElement
}) {
  return (
    <Tooltip content={content} side="bottom">
      {children}
    </Tooltip>
  )
}

export function activeMenuItem(on: boolean): string {
  return `${menuItem} ${on ? menuItemActive : ''}`
}

export function Stepper({
  icon,
  label,
  value,
  onDec,
  onInc,
  onBeforeChange,
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
  onBeforeChange?: () => void
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
          onPointerDown={onBeforeChange}
          onMouseDown={onBeforeChange}
          onFocus={onBeforeChange}
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
            className={`${valueClass} text-center text-caption tabular-nums text-ink-600 hover:text-ink-800 ${focusRing}`}
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
          onPointerDown={onBeforeChange}
          onMouseDown={onBeforeChange}
          onFocus={onBeforeChange}
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
