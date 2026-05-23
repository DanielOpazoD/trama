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
    <div className="px-5 pt-3">
      <button
        onClick={handleClick}
        disabled={createChatThread.isPending}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{
          backgroundColor: 'var(--accent-primary-soft)',
          color: 'var(--accent-primary)',
        }}
        title="Abre un hilo de chat focalizado en esta entidad: su contexto, sus citas y sus relaciones."
      >
        <SparkleIcon size={12} />
        {createChatThread.isPending ? 'Abriendo…' : 'Hablar'}
      </button>
    </div>
  )
}
