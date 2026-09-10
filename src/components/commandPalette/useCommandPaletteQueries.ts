import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueryHit, QueryInput } from '../../api/query'
import { useAskQuery, useRunQuery, useSaveQuery } from '../../state/useSavedQueries'
import { useToast } from '../../state/toast'
import type { CommandPaletteResultsState } from './CommandPaletteDialog'

// Las respuestas de /api/query y /api/query/nl no pasan por un contrato de
// runtime (esos son de lectura). Una forma equivocada llegaba hasta el render y
// tumbaba la app entera, porque la paleta vive fuera de los ErrorBoundary de
// las vistas: medido en demo, antes de que la demo respondiera estas rutas.
function withHits<T extends { items: QueryHit[] }>(res: T): T {
  if (!Array.isArray((res as { items?: unknown } | null)?.items)) {
    throw new Error('La consulta respondió sin items.')
  }
  return res
}

/**
 * Las consultas que corre la paleta: preguntar en lenguaje natural, correr una
 * consulta guardada y guardar la que está a la vista.
 *
 * Cada consulta abre un turno, y cambiar la búsqueda o volver abre otro: la
 * respuesta que llega con su turno ya pasado se descarta. Sin eso, una pregunta
 * lenta reabría sus resultados encima de lo que se estaba escribiendo.
 */
export function useCommandPaletteQueries({
  query,
  onResults,
}: {
  query: string
  onResults: (results: CommandPaletteResultsState) => void
}) {
  const [running, setRunning] = useState(false)
  const turn = useRef(0)
  const { mutateAsync: ask } = useAskQuery()
  const { mutateAsync: run } = useRunQuery()
  const { mutateAsync: save, isPending: saving } = useSaveQuery()
  const toast = useToast()

  const invalidate = useCallback(() => {
    turn.current += 1
    setRunning(false)
  }, [])

  useEffect(() => {
    invalidate()
  }, [invalidate, query])

  const launch = useCallback(
    <T>(request: () => Promise<T>, show: (res: T) => void, failure: string) => {
      const current = ++turn.current
      setRunning(true)
      request()
        .then((res) => {
          if (turn.current === current) show(res)
        })
        .catch(() => {
          if (turn.current === current) toast.show({ message: failure, tone: 'error' })
        })
        .finally(() => {
          if (turn.current === current) setRunning(false)
        })
    },
    [toast],
  )

  const runAsk = useCallback(
    (q: string) =>
      launch(
        () => ask(q).then(withHits),
        (res) =>
          onResults({
            hits: res.items,
            ast: res.query,
            source: res.source,
            heading: `«${q}»`,
          }),
        'No se pudo interpretar la pregunta.',
      ),
    [ask, launch, onResults],
  )

  const runAst = useCallback(
    (input: QueryInput, heading: string, savedQueryId?: string) =>
      launch(
        () => run(input).then(withHits),
        (res) => onResults({ hits: res.items, ast: input, heading, savedQueryId }),
        'No se pudo ejecutar la consulta.',
      ),
    [launch, onResults, run],
  )

  /** Resuelve si se guardó: quien llama solo borra el nombre cuando es cierto. */
  const saveQuery = useCallback(
    (name: string, input: QueryInput) =>
      save({ name, query: input }).then(
        () => true,
        () => false,
      ),
    [save],
  )

  return { invalidate, running, runAsk, runAst, saveQuery, saving }
}
