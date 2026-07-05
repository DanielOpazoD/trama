import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPopover } from '../../hooks/useAnchoredPopover'
import { useDeleteEntity, useQuotesQuery } from '../../state'
import { useChatThreadsQuery, useCreateChatThread } from '../../state/useChat'
import type { Entity } from '../../types'
import { ChatIcon, PencilIcon, PrinterIcon, TrashIcon } from '../Icons'
import { PrintObject } from '../print/PrintObject'
import { EntityPrintSheet } from '../print/PrintSheets'

/**
 * Menú "⋯" del header del panel de entidad. Agrupa las acciones secundarias
 * que antes ocupaban espacio propio: "Editar descripción", "Hablar con la
 * entidad" (hilo de chat) y "Eliminar". Mantiene el panel limpio — solo el ⋯
 * y el cerrar quedan a la vista. Se porta a document.body (no se recorta) y
 * maneja clic-afuera/Escape.
 */
export function EntityActionsMenu({
  entity,
  onOpenThread,
  onEditDescription,
  onClose: closePanel,
}: {
  entity: Entity
  onOpenThread?: (threadId: string) => void
  onEditDescription?: () => void
  onClose: () => void
}) {
  const { data: chatThreads = [] } = useChatThreadsQuery()
  const createChatThread = useCreateChatThread()
  const deleteEntity = useDeleteEntity()

  const [confirming, setConfirming] = useState(false)
  // Imprimir como objeto: la ficha de catálogo de la entidad + sus citas.
  const [printOpen, setPrintOpen] = useState(false)
  const { data: allQuotes = [] } = useQuotesQuery()
  const popover = useAnchoredPopover({ onClose: () => setConfirming(false) })

  async function talk() {
    popover.close()
    if (!onOpenThread) return
    const ctx = `entity:${entity.id}`
    const existing = chatThreads.find((t) => t.context === ctx)
    if (existing) return onOpenThread(existing.id)
    try {
      const created = await createChatThread.mutateAsync({
        context: ctx,
        title: `Sobre ${entity.name}`,
      })
      onOpenThread(created.id)
    } catch {
      /* surfaces via createChatThread.error */
    }
  }

  async function remove() {
    try {
      await deleteEntity.mutateAsync(entity.id)
      popover.close()
      closePanel()
    } catch {
      /* surfaces */
    }
  }

  const ROW =
    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-body text-left transition-colors'

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        aria-label="Más acciones"
        title="Más acciones"
        className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
      >
        <span aria-hidden className="block text-lead leading-none -mt-1">
          ⋯
        </span>
      </button>
      {popover.open &&
        popover.position &&
        createPortal(
          <div
            ref={popover.layerRef}
            role="menu"
            style={{
              position: 'fixed',
              top: popover.position.top,
              bottom: popover.position.bottom,
              right: popover.position.right,
            }}
            className="z-50 w-52 paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-1.5 animate-fade-up"
          >
            {confirming ? (
              <div className="px-1 py-0.5">
                <p className="text-body text-ink-600 px-1.5 py-1">
                  ¿Eliminar esta entidad?
                </p>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <button
                    onClick={() => setConfirming(false)}
                    className="btn-ghost text-caption"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={remove}
                    disabled={deleteEntity.isPending}
                    className="text-caption uppercase tracking-eyebrow text-[color:var(--accent-clay)] hover:text-[color:var(--accent-clay)] disabled:opacity-50"
                  >
                    {deleteEntity.isPending ? 'eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {onEditDescription && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      popover.close()
                      onEditDescription()
                    }}
                    className={`${ROW} text-ink-600 hover:text-ink-800 hover:bg-ink-100/60`}
                  >
                    <PencilIcon size={12} />
                    Editar descripción
                  </button>
                )}
                {onOpenThread && (
                  <button
                    role="menuitem"
                    onClick={talk}
                    disabled={createChatThread.isPending}
                    className={`${ROW} text-ink-600 hover:text-ink-800 hover:bg-ink-100/60 disabled:opacity-50`}
                  >
                    <ChatIcon size={12} />
                    {createChatThread.isPending ? 'Abriendo…' : 'Hablar con la entidad'}
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    popover.close()
                    setPrintOpen(true)
                  }}
                  className={`${ROW} text-ink-600 hover:text-ink-800 hover:bg-ink-100/60`}
                >
                  <PrinterIcon size={12} />
                  Imprimir ficha
                </button>
                <div className="h-px bg-ink-100 my-1" />
                <button
                  role="menuitem"
                  onClick={() => setConfirming(true)}
                  className={`${ROW} text-[color:var(--accent-clay)] hover:text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay-soft)]`}
                >
                  <TrashIcon size={12} />
                  Eliminar
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {printOpen && (
        <PrintObject onDone={() => setPrintOpen(false)}>
          <EntityPrintSheet
            entity={entity}
            quotes={allQuotes.filter((q) => q.entityId === entity.id)}
          />
        </PrintObject>
      )}
    </>
  )
}
