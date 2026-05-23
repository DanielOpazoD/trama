import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Sistema mínimo de toasts para feedback efímero. Pensado sobre todo para
 * el undo de acciones destructivas, aunque queda disponible para
 * cualquier mensaje breve (errores transitorios, confirmaciones).
 *
 * Diseño:
 *   - Un solo toast activo a la vez. Si llega otro, reemplaza al actual.
 *     (Un stack haría la vista ruidosa para un usuario único; KISS.)
 *   - Auto-dismiss configurable (default 5s) con barra de progreso visible.
 *   - "Acción" opcional con label custom — para "Deshacer", "Reintentar",
 *     etc. Al click se ejecuta y se cierra el toast.
 *   - Se puede dismissar a mano.
 */

export type ToastAction = {
  label: string
  onAction: () => void | Promise<void>
}

export type Toast = {
  id: string
  message: string
  /** Acción primaria opcional ("Deshacer", "Reintentar"…). */
  action?: ToastAction
  /** Milisegundos hasta auto-dismiss. Default 5000. 0 = persistente. */
  durationMs?: number
  /** Tono visual. */
  tone?: 'default' | 'error' | 'success'
}

type ToastContextValue = {
  current: Toast | null
  show: (toast: Omit<Toast, 'id'>) => void
  dismiss: () => void
}

const ToastContext = createContext<ToastContextValue>({
  current: null,
  show: () => {},
  dismiss: () => {},
})

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const dismiss = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setCurrent(null)
  }, [])

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const next: Toast = {
      ...toast,
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    setCurrent(next)
    const duration = toast.durationMs ?? 5000
    if (duration > 0) {
      timeoutRef.current = window.setTimeout(() => {
        setCurrent((prev) => (prev?.id === next.id ? null : prev))
        timeoutRef.current = null
      }, duration)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const value = useMemo(() => ({ current, show, dismiss }), [current, show, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}
