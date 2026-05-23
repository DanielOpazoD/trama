import { useState } from 'react'
import { useDeleteEntity } from '../../state'
import type { Entity } from '../../types'
import { TrashIcon } from '../Icons'
import { Tooltip } from '../Tooltip'

/**
 * Footer del panel con el botón de eliminar (two-step: primero confirma).
 *
 * El delete fija un `deletedAt` que el toast usa para ofrecer "Deshacer"
 * — esa parte vive en useDeleteEntity, acá solo disparamos la mutation
 * y cerramos el panel.
 */
export function DeleteFooter({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  const deleteEntity = useDeleteEntity()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <footer className="px-5 py-3 border-t border-ink-100 flex justify-end">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-600">¿Borrar?</span>
          <button onClick={() => setConfirming(false)} className="btn-ghost">
            Cancelar
          </button>
          <button
            onClick={async () => {
              await deleteEntity.mutateAsync(entity.id)
              onClose()
            }}
            className="text-red-700 hover:text-red-900 text-sm"
          >
            Sí
          </button>
        </div>
      </footer>
    )
  }

  return (
    <footer className="px-5 py-3 border-t border-ink-100 flex justify-end">
      <Tooltip content="Eliminar entidad">
        <button
          onClick={() => setConfirming(true)}
          className="p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded transition-colors"
          aria-label="Eliminar"
        >
          <TrashIcon size={14} />
        </button>
      </Tooltip>
    </footer>
  )
}
