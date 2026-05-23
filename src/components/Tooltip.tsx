import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'

/**
 * Tooltip editorial — reemplaza al `title=""` HTML nativo (que el browser
 * pinta como una caja gris a destiempo y arruina la estética). Diseño:
 *
 *   - Card oscuro (ink-800 bg, paper-50 text) con micro-shadow.
 *   - Fade-in con delay (400ms default) — no flashea cuando el cursor
 *     solo pasa por encima.
 *   - Position: arriba del trigger; si no entra, abajo.
 *   - Hover: open. Focus: open. Esc: close. Mouseleave: close.
 *
 * Uso típico:
 *   <Tooltip content="Eliminar">
 *     <button aria-label="Eliminar"><TrashIcon /></button>
 *   </Tooltip>
 *
 * El componente clona el child y le añade event handlers, así no necesita
 * un wrapper extra que rompa layout. El child debe ser un único React
 * element capaz de aceptar refs y handlers (button, a, span con role).
 *
 * Si el tooltip no calza visualmente en un caso edge, usar el `title=`
 * HTML nativo sigue siendo válido como fallback.
 */
export function Tooltip({
  content,
  children,
  delayMs = 400,
  side = 'top',
}: {
  content: ReactNode
  children: ReactElement
  /** Milisegundos antes de abrirse. 400 evita flashes en mouseover. */
  delayMs?: number
  /** Posición preferida; si no entra se intenta la opuesta. */
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<CSSProperties | null>(null)
  const [resolvedSide, setResolvedSide] = useState<'top' | 'bottom'>(side)
  const triggerRef = useRef<HTMLElement | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const tooltipId = useRef(`tt-${Math.random().toString(36).slice(2, 10)}`)

  function show() {
    if (timeoutRef.current !== null) return
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // Decidir lado: si arriba no entra en viewport, ir abajo.
      const wantsTop = side === 'top'
      const fitsAbove = rect.top > 48
      const finalSide: 'top' | 'bottom' = wantsTop && fitsAbove ? 'top' : 'bottom'
      setResolvedSide(finalSide)
      setCoords({
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: finalSide === 'top' ? rect.top - 6 : rect.bottom + 6,
        transform: `translate(-50%, ${finalSide === 'top' ? '-100%' : '0'})`,
      })
      setOpen(true)
    }, delayMs)
  }

  function hide() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setOpen(false)
  }

  // Cleanup en unmount.
  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  // Esc cierra el tooltip si está abierto (accesibilidad teclado).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!isValidElement(children)) return children

  // Clonamos el child y le inyectamos los listeners + aria-describedby
  // cuando el tooltip está abierto. Preservamos cualquier handler/ref
  // que el child tenga.
  const childProps = (children.props ?? {}) as {
    onMouseEnter?: React.MouseEventHandler
    onMouseLeave?: React.MouseEventHandler
    onFocus?: React.FocusEventHandler
    onBlur?: React.FocusEventHandler
    ref?: React.Ref<HTMLElement>
    'aria-describedby'?: string
  }
  const trigger = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el
      // forwardear ref si el child la tenía
      const oldRef = childProps.ref
      if (typeof oldRef === 'function') oldRef(el)
      else if (oldRef && 'current' in oldRef) {
        ;(oldRef as React.MutableRefObject<HTMLElement | null>).current = el
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e)
      show()
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e)
      hide()
    },
    'aria-describedby': open ? tooltipId.current : childProps['aria-describedby'],
  } as Record<string, unknown>)

  return (
    <>
      {trigger}
      {open && coords && (
        <div
          id={tooltipId.current}
          role="tooltip"
          style={coords}
          className="z-50 pointer-events-none animate-fade-up"
          data-side={resolvedSide}
        >
          <div className="px-2 py-1 text-micro rounded-md bg-ink-800 text-paper-50 shadow-lg shadow-ink-900/25 max-w-xs leading-snug font-sans tracking-normal">
            {content}
          </div>
        </div>
      )}
    </>
  )
}
