import { useChatThreadsQuery, useCreateChatThread } from '../../state/useChat'
import type { Entity } from '../../types'
import { SparkleIcon } from '../Icons'

/**
 * Botón "Hablar" que abre un hilo de chat focalizado en esta entidad.
 *
 * Reusa el hilo existente con `context = entity:<id>` si ya hay uno;
 * si no, crea uno nuevo titulado "Sobre <nombre>". Después llama
 * `onOpenThread(threadId)` para que el padre cambie la vista a chat.
 */
export function TalkButton({
  entity,
  onOpenThread,
}: {
  entity: Entity
  onOpenThread: (threadId: string) => void
}) {
  const { data: chatThreads = [] } = useChatThreadsQuery()
  const createChatThread = useCreateChatThread()

  async function handleClick() {
    const wantedContext = `entity:${entity.id}`
    const existing = chatThreads.find((t) => t.context === wantedContext)
    if (existing) {
      onOpenThread(existing.id)
      return
    }
    try {
      const created = await createChatThread.mutateAsync({
        context: wantedContext,
        title: `Sobre ${entity.name}`,
      })
      onOpenThread(created.id)
    } catch {
      /* surfaces via createChatThread.error */
    }
  }

  return (
    // θ1: padding alineado con el resto del panel (px-6) y más vertical
    // (py-4) para que el CTA tenga presencia. El botón ahora es más
    // ancho y con sparkle más visible — es la acción primaria del panel.
    <div className="px-6 pt-4">
      <button
        onClick={handleClick}
        disabled={createChatThread.isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
        style={{
          backgroundColor: 'var(--accent-primary-soft)',
          color: 'var(--accent-primary)',
        }}
        title="Abre un hilo de chat focalizado en esta entidad: su contexto, sus citas y sus relaciones."
      >
        <SparkleIcon size={14} />
        {createChatThread.isPending ? 'Abriendo…' : `Hablar con ${entity.name.length < 18 ? entity.name : 'esta entidad'}`}
      </button>
    </div>
  )
}
