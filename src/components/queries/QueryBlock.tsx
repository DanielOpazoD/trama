import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryApi, type QueryInput } from '../../api/query'
import { QueryResultList } from './QueryResultList'

/**
 * Bloque embebible (Fase 4): renderiza EN VIVO los resultados de una consulta
 * embebida en una nota. Se dispara desde el renderer de markdown al toparse con
 * una valla ```trama-query cuyo cuerpo es el AST JSON (el mismo shape de
 * /api/query). Es self-contained: el AST viaja en el bloque, así que no depende
 * de ninguna consulta guardada para renderizarse.
 *
 * Defensivo: si el JSON no parsea o no tiene `from`, muestra un aviso en vez de
 * romper la nota. El resultado se cachea por contenido del bloque.
 */
function parseSpec(
  source: string,
): { ok: true; query: QueryInput } | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    return { ok: false, error: 'el contenido no es JSON válido' }
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as { from?: unknown }).from) ||
    (data as { from: unknown[] }).from.length === 0
  ) {
    return { ok: false, error: 'falta "from" (los tipos a consultar)' }
  }
  return { ok: true, query: data as QueryInput }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="my-2 rounded-xl border border-ink-100 bg-ink-50/40 p-3"
      // No abrir el detalle de la nota al interactuar con el bloque.
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-micro uppercase tracking-eyebrow text-ink-400">
        Consulta embebida
      </p>
      {children}
    </div>
  )
}

export function QueryBlock({ source }: { source: string }) {
  const parsed = useMemo(() => parseSpec(source), [source])
  const { data, isLoading, isError } = useQuery({
    queryKey: ['query-block', source],
    queryFn: () => queryApi.run((parsed as { query: QueryInput }).query),
    enabled: parsed.ok,
    staleTime: 60_000,
  })

  if (!parsed.ok) {
    return (
      <Shell>
        <p className="text-sm text-ink-500">No se pudo leer el bloque: {parsed.error}.</p>
      </Shell>
    )
  }
  if (isLoading) {
    return (
      <Shell>
        <p className="text-sm text-ink-400 italic">Cargando resultados…</p>
      </Shell>
    )
  }
  if (isError || !data) {
    return (
      <Shell>
        <p className="text-sm text-ink-500">No se pudo ejecutar la consulta.</p>
      </Shell>
    )
  }
  return (
    <Shell>
      <QueryResultList
        items={data.items}
        emptyHint="La consulta no devolvió resultados."
      />
    </Shell>
  )
}
