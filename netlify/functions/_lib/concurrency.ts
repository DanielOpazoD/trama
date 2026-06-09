/**
 * Procesa `items` con a lo sumo `limit` workers en vuelo a la vez (pool de
 * concurrencia acotada).
 *
 * Para importaciones grandes esto convierte N inserts estrictamente
 * secuenciales (N × round-trip HTTP a Neon — en volúmenes reales agota el
 * timeout de la función) en ~ceil(N / limit) olas paralelas, SIN tocar el SQL
 * ni la semántica por-ítem: cada `worker` sigue corriendo su propio insert con
 * su try/catch, ON CONFLICT y conteo. Solo cambia el *scheduling*.
 *
 * El orden de procesamiento NO se garantiza: usar solo cuando los ítems son
 * independientes entre sí (p.ej. inserts de la misma tabla sin FK cruzadas).
 * Los errores del worker se propagan (rechazan la promesa) igual que en un
 * `for…of await`; si el caller quiere resiliencia por-ítem, debe atrapar dentro
 * del worker.
 */
export async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (limit < 1) throw new Error('forEachConcurrent: limit debe ser >= 1')

  let cursor = 0
  const poolSize = Math.min(limit, items.length)

  const runners = Array.from({ length: poolSize }, async () => {
    // `cursor++` es atómico entre microtasks (no hay await en el medio), así
    // que dos runners nunca toman el mismo índice.
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      await worker(items[index]!, index)
    }
  })

  await Promise.all(runners)
}
