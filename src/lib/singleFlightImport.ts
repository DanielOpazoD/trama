/**
 * Una sola importación en vuelo por módulo perezoso: la precarga y el `lazy`
 * comparten la misma promesa, y un fallo se olvida para que el próximo intento
 * la vuelva a pedir.
 *
 * El navegador ya unifica dos `import()` del mismo módulo, pero vitest no: con
 * dos importaciones concurrentes de un módulo simulado entregó el mock a la
 * primera y el módulo real a la segunda (medido en NotasWorld.test).
 */
export function singleFlightImport<T>(importer: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    pending ??= importer().catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
}
