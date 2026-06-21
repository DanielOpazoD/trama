import { libraryItemServeUrl } from '../../api/biblioteca'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import type { LibraryItem } from '../../types/biblioteca'
import { FileTypeIcon } from './FileTypeIcon'

// Pixel transparente: mientras el blob viaja el <img> carga ESTO (no un src
// vacío) — así el navegador nunca dibuja su icono de imagen rota.
const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * Miniatura de un item de la Biblioteca. Para imágenes con URL de servir baja
 * el blob de forma autenticada (vía `useAuthenticatedMediaState`: los endpoints
 * `/api/{momentos-file,notas-attachments-file,recortes-image}` exigen el bearer,
 * un `<img src>` directo daría 401) y lo muestra como object-URL, recortado,
 * redondeado y con borde suave. Si la imagen falla, o el item no es imagen / no
 * tiene URL, cae al glifo de tipo (`FileTypeIcon`) sobre un recuadro de papel.
 *
 * Dos tamaños: `small` para filas de lista (size-9) y `large` para las cards de
 * la cuadrícula (llena el alto disponible). Presentacional.
 */
export function Thumbnail({
  item,
  size = 'small',
}: {
  item: LibraryItem
  size?: 'small' | 'large'
}) {
  const serveUrl = item.fileType === 'image' ? libraryItemServeUrl(item) : null
  const { src, status } = useAuthenticatedMediaState(serveUrl)

  // El recuadro: en lista es un cuadradito fijo; en cuadrícula se estira para
  // llenar la zona de media de la card (alto controlado por el padre).
  const frame =
    size === 'small' ? 'size-9 rounded-md' : 'h-full w-full min-h-28 rounded-lg'
  const box = `${frame} shrink-0 border border-ink-100/70 bg-paper-100/40`

  // Sin URL de servir (no-imagen, dominio PDF, sin key) o error de carga →
  // glifo de tipo centrado sobre el recuadro de papel.
  if (!serveUrl || status === 'error') {
    return (
      <div aria-hidden className={`${box} flex items-center justify-center`}>
        <FileTypeIcon
          fileType={item.fileType}
          mimeType={item.mimeType}
          size={size === 'small' ? 18 : 30}
        />
      </div>
    )
  }

  // El <img> siempre montado: mientras el blob viaja muestra un pixel
  // transparente sobre el fondo papel que late (nunca el icono roto del browser).
  const ready = status === 'ready' && !!src
  return (
    <img
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      src={ready ? src : TRANSPARENT_PX}
      className={`${box} object-cover ${status === 'loading' ? 'animate-pulse-subtle' : ''}`.trim()}
    />
  )
}
