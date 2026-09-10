import { lazy, Suspense, useEffect, useRef, type ComponentProps } from 'react'
import type { CommandPalette } from '../CommandPalette'
import { ErrorBoundary } from '../ErrorBoundary'
import { useToast } from '../../state'
import { loadCommandPalette } from './loadCommandPalette'

type CommandPaletteHostProps = ComponentProps<typeof CommandPalette>

// React recuerda el rechazo de un `lazy`: tras un fallo, el siguiente intento
// necesita uno nuevo. Mientras no falle se reutiliza, y reabrir la paleta ya
// bajada no vuelve a suspender.
let LazyCommandPalette = lazy(loadCommandPalette)

/**
 * El único punto de montaje del buscador. Baja la paleta al abrirla y la aísla en
 * su propio ErrorBoundary: vive fuera de los de las vistas, y un fallo suyo
 * llegaba al de la raíz («La trama se rompió»).
 */
export function CommandPaletteHost(props: CommandPaletteHostProps) {
  if (!props.open) return null
  return (
    <ErrorBoundary
      scope="omnibox"
      fallback={() => <OmniboxUnavailable onClose={props.onClose} />}
    >
      <Suspense fallback={null}>
        <LazyCommandPalette {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}

function OmniboxUnavailable({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const avisado = useRef(false)
  useEffect(() => {
    if (avisado.current) return
    avisado.current = true
    LazyCommandPalette = lazy(loadCommandPalette)
    toast.show({ message: 'No se pudo abrir el buscador.', tone: 'error' })
    onClose()
  }, [onClose, toast])
  return null
}
