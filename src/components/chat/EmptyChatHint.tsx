/**
 * Empty state del panel de conversación. Aparece cuando no hay hilo
 * activo y el usuario no ha empezado a chatear. Texto centrado en
 * serif para anclar con el resto de la voz editorial.
 */
export function EmptyChatHint() {
  return (
    <div className="max-w-md mx-auto text-center px-6 py-12">
      <p className="font-serif text-xl text-ink-500 leading-relaxed">
        Conversa con tu trama.
      </p>
      <p className="mt-3 text-sm text-ink-400 leading-relaxed">
        Pregúntale qué cosas se conectan entre sí, qué autores se parecen, qué
        leer después de un libro que está en la trama, qué clasificación podría
        mejorar. La IA usa todo lo que has guardado como contexto.
      </p>
    </div>
  )
}
