import { useState } from 'react'
import { useSectionPin } from '../hooks/useSectionPin'
import { LockIcon } from './Icons'
import { PinPad } from './PinPad'

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

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <PinPad
        eyebrow="sección protegida"
        title="Ingresa el PIN"
        subtitle="Esta sección requiere verificación. Confirma con tu clave para continuar."
        correctPin={PIN}
        onUnlock={() => setUnlocked(true)}
      />
    </div>
  )
}
