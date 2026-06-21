import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { LibraryItem } from '../../types/biblioteca'
import { useSetLibraryItemDeleted, useToast } from '../../state'
import { api } from '../../api'
import { canDownloadLibraryItem } from '../../api/biblioteca'
import { Tooltip } from '../Tooltip'
import { DownloadIcon, PencilIcon, RotateIcon, TrashIcon } from '../Icons'

/**
 * Acciones por item de la Biblioteca (PR4) — botones-ícono quietos que aparecen
 * al hover/focus de la fila o la card. Compartido por lista y cuadrícula.
 *
 * Dos modos:
 *   - normal: Renombrar · Descargar (si el dominio tiene blob servible) · Eliminar
 *     (a la papelera; el borrado es clay y se confirma por "Deshacer", sin diálogo)
 *   - papelera (`trash`): solo Restaurar (el borrado permanente llega después)
 *
 * Renombrar lo abre el padre (modal único en el orquestador) vía `onRename`.
 * Descargar/eliminar/restaurar usan hooks/cliente acá mismo. Cada botón frena la
 * propagación para no disparar acciones de la fila/card que lo contiene.
 */

function stop(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

const BTN_BASE =
  'inline-flex items-center justify-center size-7 rounded-md text-ink-300 transition-colors duration-150 hover:text-ink-700 hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 disabled:opacity-50'

export function BibliotecaItemActions({
  item,
  trash = false,
  orientation = 'horizontal',
  onRename,
}: {
  item: LibraryItem
  /** Vista papelera: solo Restaurar. */
  trash?: boolean
  /** `vertical` para el borde de las cards; `horizontal` para filas. */
  orientation?: 'horizontal' | 'vertical'
  onRename: (item: LibraryItem) => void
}) {
  const setDeleted = useSetLibraryItemDeleted()
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)

  const wrapClass =
    orientation === 'vertical'
      ? 'flex flex-col items-center gap-1'
      : 'flex items-center gap-0.5'

  async function handleDownload(event: MouseEvent) {
    stop(event)
    if (downloading) return
    setDownloading(true)
    try {
      await api.biblioteca.download(item)
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo descargar',
        tone: 'error',
      })
    } finally {
      setDownloading(false)
    }
  }

  function handleDelete(event: MouseEvent) {
    stop(event)
    setDeleted.mutate({ kind: item.kind, itemId: item.itemId, deleted: true })
  }

  function handleRestore(event: MouseEvent) {
    stop(event)
    setDeleted.mutate({ kind: item.kind, itemId: item.itemId, deleted: false })
  }

  if (trash) {
    return (
      <div className={wrapClass}>
        <Tooltip content="Restaurar">
          <button
            type="button"
            aria-label="Restaurar"
            onClick={handleRestore}
            disabled={setDeleted.isPending}
            className={BTN_BASE}
          >
            <RotateIcon size={15} />
          </button>
        </Tooltip>
      </div>
    )
  }

  const downloadable = canDownloadLibraryItem(item)

  return (
    <div className={wrapClass}>
      <Tooltip content="Renombrar">
        <button
          type="button"
          aria-label="Renombrar"
          onClick={(e) => {
            stop(e)
            onRename(item)
          }}
          className={BTN_BASE}
        >
          <PencilIcon size={14} />
        </button>
      </Tooltip>

      {downloadable && (
        <Tooltip content="Descargar">
          <button
            type="button"
            aria-label="Descargar"
            onClick={handleDownload}
            disabled={downloading}
            className={BTN_BASE}
          >
            <DownloadIcon size={15} />
          </button>
        </Tooltip>
      )}

      <Tooltip content="Eliminar">
        <button
          type="button"
          aria-label="Eliminar"
          onClick={handleDelete}
          disabled={setDeleted.isPending}
          className={`${BTN_BASE} hover:text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay)]/10`}
        >
          <TrashIcon size={15} />
        </button>
      </Tooltip>
    </div>
  )
}
