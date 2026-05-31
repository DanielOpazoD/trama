import { Component, type ErrorInfo, type ReactNode } from 'react'
import { request } from '../api/request'
import { TramaMark } from './Icons'

/**
 * ErrorBoundary. Captura errores no manejados en el render tree y muestra
 * un fallback en vez de dejar el subárbol en blanco.
 *
 * - Por defecto (sin `fallback` prop): pantalla completa "la trama se rompió"
 *   — usado a nivel raíz en App.tsx para crashes catastróficos.
 * - Con `fallback` prop (render prop): permite un fallback compacto y
 *   contextual. Usado en ViewRouter para que un crash en una vista NO
 *   tire abajo Sidebar/TopBar; el usuario puede cambiar de vista o
 *   reintentar sin perder navegación.
 *
 * Reporta a /api/error-log (POST) en best-effort — si el backend está
 * caído también, el reporte falla silencioso. La idea es que un crash
 * del cliente quede registrado en la misma tabla que los errores del
 * servidor, para que el Health panel en Settings los muestre juntos.
 *
 * Nota: TanStack Query maneja errores de queries/mutations por su
 * cuenta y NO llegan acá. Este boundary captura errores síncronos del
 * render: type errors, null derefs, throws en componentes, etc.
 */

export type ErrorFallbackProps = {
  error: Error
  componentStack: string | null
  onReset: () => void
  onReload: () => void
}

type Props = {
  children: ReactNode
  /** Opcional: si se pasa, reemplaza el fallback fullscreen por uno
   *  contextual. Útil para boundaries granulares (ej. per-view). */
  fallback?: (props: ErrorFallbackProps) => ReactNode
  /** Etiqueta para logs/observability — distingue un crash root de uno
   *  per-view en `/api/error-log`. Default: 'root'. */
  scope?: string
}

type State = {
  error: Error | null
  componentStack: string | null
}

const INITIAL_STATE: State = { error: null, componentStack: null }

export class ErrorBoundary extends Component<Props, State> {
  state = INITIAL_STATE

  static getDerivedStateFromError(error: Error): Partial<State> {
    // En este lifecycle no tenemos componentStack — eso llega en
    // componentDidCatch. Solo registramos el error para que el render
    // muestre el fallback en el siguiente ciclo.
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    void reportError(error, info, this.props.scope ?? 'root')
    // También a la consola — el dev puede ver el stack completo ahí.

    console.error(`[ErrorBoundary:${this.props.scope ?? 'root'}]`, error, info)
  }

  handleReset = () => {
    this.setState(INITIAL_STATE)
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (this.state.error) {
      const fallbackProps: ErrorFallbackProps = {
        error: this.state.error,
        componentStack: this.state.componentStack,
        onReset: this.handleReset,
        onReload: this.handleReload,
      }
      if (this.props.fallback) return this.props.fallback(fallbackProps)
      return <ErrorFallback {...fallbackProps} />
    }
    return this.props.children
  }
}

async function reportError(error: Error, info: ErrorInfo, scope: string) {
  if (typeof window === 'undefined') return
  try {
    await request<void>('/api/error-log', {
      method: 'POST',
      body: JSON.stringify({
        message: error.message || 'Unknown error',
        stack: error.stack ?? null,
        componentStack: info.componentStack ?? null,
        path: window.location.pathname,
        userAgent: window.navigator.userAgent,
        scope,
      }),
    })
  } catch {
    /* best-effort: si el backend no responde, no podemos hacer nada */
  }
}

function ErrorFallback({
  error,
  componentStack,
  onReset,
  onReload,
}: {
  error: Error
  componentStack: string | null
  onReset: () => void
  onReload: () => void
}) {
  const details =
    `${error.name}: ${error.message}\n\n` +
    (error.stack ? `Stack:\n${error.stack}\n\n` : '') +
    (componentStack ? `Component stack:${componentStack}` : '')

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(details)
    } catch {
      /* navegador sin clipboard API o sin permiso — fallback abajo */
    }
  }

  return (
    <div
      role="alert"
      className="h-screen w-screen flex items-center justify-center p-6 bg-paper-50"
    >
      <div className="max-w-lg w-full bg-paper-50 border border-ink-100 rounded-xl shadow-xl shadow-ink-900/10 p-8">
        {/* EE-brand #21: TramaMark sutil arriba del error — aún en
            estado roto, el usuario sabe en qué app está. ink-200 muy
            muted; no compite con el mensaje. */}
        <TramaMark size={18} className="text-ink-200 mb-3" />
        <p className="text-micro uppercase tracking-shout text-ink-300 mb-2">Error</p>
        <h1 className="font-serif text-2xl text-ink-800 leading-tight mb-3">
          La trama se rompió.
        </h1>
        <p className="text-ink-500 text-sm leading-relaxed mb-4">
          Algo falló mientras renderizaba la app. Tus datos están a salvo en el servidor —
          esto es un problema del cliente. Prueba recargar; si vuelve a pasar, copia los
          detalles para que veamos qué pasó.
        </p>

        <details className="mb-5 group">
          <summary className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 cursor-pointer transition-colors">
            Detalles técnicos
          </summary>
          <pre className="mt-3 p-3 bg-ink-50 border border-ink-100 rounded-md text-caption text-ink-600 leading-relaxed overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
            {details}
          </pre>
        </details>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onReload} className="btn-ink text-xs">
            Recargar la app
          </button>
          <button onClick={onReset} className="btn-ghost text-xs">
            Intentar de nuevo
          </button>
          <button
            onClick={copyDetails}
            className="ml-auto text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
          >
            Copiar detalles
          </button>
        </div>
      </div>
    </div>
  )
}
