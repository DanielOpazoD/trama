import { useEffect, useRef, useState } from 'react'
import { useSectionPin } from '../hooks/useSectionPin'
import { LockIcon } from './Icons'

/**
 * PIN hardcoded — idéntico al de AppPinGate.tsx. Mecanismo transitorio de
 * baja seguridad — sirve para que alguien que toma el teléfono no vea el
 * contenido, no como auth real.
 */
const PIN = '151219'

/**
 * Gate de PIN por sección. Se renderiza inline (card dentro del viewport de
 * contenido) en lugar de full-screen como AppPinGate.
 *
 * El estado "desbloqueado" vive en useState del componente — al navegar a
 * otra sección y volver, el componente se desmonta y remonta, pidiendo PIN
 * de nuevo. Esto cumple el requisito de "re-prompt cada navegación".
 *
 * @param sectionId — id de la sección (ViewMode o NotasSection)
 * @param children — el contenido de la vista, solo se muestra tras desbloquear
 */
export function SectionPinGate({
  sectionId,
  children,
}: {
  sectionId: string
  children: React.ReactNode
}) {
  const { isPinRequired } = useSectionPin()

  // Si la sección no tiene PIN, pasar directo.
  if (!isPinRequired(sectionId)) return <>{children}</>

  // El gate se activa — renderizamos el prompt.
  return <PinPromptOrContent>{children}</PinPromptOrContent>
}

/**
 * Componente interno que gestiona el estado de desbloqueo.
 * Se monta cada vez que el usuario navega a la sección, así que el estado
 * siempre arranca en `locked`.
 */
function PinPromptOrContent({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)

  if (unlocked) {
    return (
      <div className="relative h-full w-full flex flex-col">
        {children}
        {/* Botón flotante para volver a bloquear manualmente la sección */}
        <button
          onClick={() => setUnlocked(false)}
          className="fixed bottom-6 right-6 z-50 p-2.5 bg-paper-50 hover:bg-paper-100 text-ink-400 hover:text-ink-700 border border-ink-200/60 rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center"
          title="Bloquear sección (volver a pedir PIN)"
          aria-label="Bloquear sección"
        >
          <LockIcon size={14} />
        </button>
      </div>
    )
  }

  return <PinPrompt onUnlock={() => setUnlocked(true)} />
}

function PinPrompt({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin === PIN) {
      setError(null)
      onUnlock()
      return
    }
    setError('PIN incorrecto')
    setPin('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-up">
      <form
        onSubmit={handleSubmit}
        className="card-paper-soft w-full max-w-sm p-7 space-y-5"
      >
        <div className="text-center space-y-2">
          <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
            sección protegida
          </p>
          <h2 className="font-serif text-2xl text-ink-700 leading-tight">
            Ingresa el PIN
          </h2>
          <p className="text-caption italic text-ink-400 max-w-xs mx-auto">
            Esta sección requiere verificación. Confirma con tu clave para continuar.
          </p>
        </div>
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              if (error) setError(null)
            }}
            placeholder="••••••"
            className="input-paper w-full text-center text-lg tracking-widest tabular-nums"
            aria-label="PIN"
            aria-invalid={error ? 'true' : undefined}
          />
          {error && (
            <p
              className="text-caption text-[color:var(--accent-clay)] text-center"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pin.length === 0}
          className="btn-accent w-full text-xs"
        >
          desbloquear
        </button>
      </form>
    </div>
  )
}
