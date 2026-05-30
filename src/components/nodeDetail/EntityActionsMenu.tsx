import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDeleteEntity } from '../../state'
import { useChatThreadsQuery, useCreateChatThread } from '../../state/useChat'
import type { Entity } from '../../types'
import { ChatIcon, PencilIcon, TrashIcon } from '../Icons'

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
  onClose,
}: {
  entity: Entity
  onOpenThread?: (threadId: string) => void
  onEditDescription?: () => void
  onClose: () => void
}) {
  const { data: chatThreads = [] } = useChatThreadsQuery()
  const createChatThread = useCreateChatThread()
  const deleteEntity = useDeleteEntity()

  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setConfirming(false)
      }
    }
    function onReflow() {
      setOpen(false)
      setConfirming(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open])

  async function talk() {
    setOpen(false)
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
      setOpen(false)
      onClose()
    } catch {
      /* surfaces */
    }
  }

  const ROW =
    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        title="Más acciones"
        className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
      >
        <span aria-hidden className="block text-base leading-none -mt-1">
          ⋯
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className="z-50 w-52 paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-1.5 animate-fade-up"
          >
            {confirming ? (
              <div className="px-1 py-0.5">
                <p className="text-sm text-ink-600 px-1.5 py-1">
                  ¿Eliminar esta entidad?
                </p>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <button
                    onClick={() => setConfirming(false)}
                    className="btn-ghost text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={remove}
                    disabled={deleteEntity.isPending}
                    className="text-xs uppercase tracking-eyebrow text-red-700 hover:text-red-800 disabled:opacity-50"
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
                      setOpen(false)
                      onEditDescription()
                    }}
                    className={`${ROW} text-ink-600 hover:text-ink-800 hover:bg-ink-100/60`}
                  >
                    <PencilIcon size={13} />
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
                    <ChatIcon size={13} />
                    {createChatThread.isPending ? 'Abriendo…' : 'Hablar con la entidad'}
                  </button>
                )}
                <div className="h-px bg-ink-100 my-1" />
                <button
                  role="menuitem"
                  onClick={() => setConfirming(true)}
                  className={`${ROW} text-red-700 hover:text-red-800 hover:bg-red-50`}
                >
                  <TrashIcon size={13} />
                  Eliminar
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
