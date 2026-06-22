import type { LibraryLinkTargetKind } from '../../types/biblioteca'
import { CameraIcon, NotesIcon, UserIcon } from '../Icons'

/**
 * Ícono por tipo de destino de conexión de la Biblioteca (PR-C):
 *   - entidad → persona (nodo de la trama)
 *   - nota    → hoja de apuntes
 *   - momento → cámara (la capa temporal: fotos, recortes, notas sueltas)
 *
 * Centraliza el mapeo para que el picker y la lista de conexiones usen el mismo
 * lenguaje visual.
 */
export function LinkTargetIcon({
  kind,
  size = 14,
  className,
}: {
  kind: LibraryLinkTargetKind
  size?: number
  className?: string
}) {
  if (kind === 'entidad') return <UserIcon size={size} className={className} />
  if (kind === 'nota') return <NotesIcon size={size} className={className} />
  return <CameraIcon size={size} className={className} />
}
