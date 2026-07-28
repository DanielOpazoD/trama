import type { Prompt } from '../../api'

export type PromptViewModel = {
  activeFilter: string | null
  collections: string[]
  filtered: Prompt[]
  /** Hay algo escrito en el buscador, aunque no haya resultados. */
  searching: boolean
  stats: {
    total: number
    favorites: number
    collections: number
    totalUses: number
  }
}

/**
 * Normaliza para comparar: sin mayúsculas y sin tildes.
 *
 * Buscar «sintesis» tiene que encontrar «Síntesis». Exigir la tilde exacta
 * convierte el buscador en un examen de ortografía.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Busca en todo lo que se ve de la tarjeta —título, contenido, colección y
 * variables—, porque un prompt se recuerda por cualquiera de esas cosas: «el de
 * {{tema}}» es tan buena pista como «el de entrevistas».
 *
 * Todos los términos deben aparecer, en cualquier orden y en cualquier campo.
 */
function coincide(prompt: Prompt, terminos: string[]): boolean {
  const heno = normalizar(
    [prompt.title, prompt.content, prompt.collection ?? '', ...prompt.variables].join(
      '\n',
    ),
  )
  return terminos.every((termino) => heno.includes(termino))
}

/**
 * La búsqueda se resuelve en el cliente a propósito, pese a que `/api/prompts`
 * acepta `?q=`: la lista ya viene entera y completa en memoria, así que filtrar
 * aquí es instantáneo, funciona sin red y no añade una consulta por pulsación.
 * Con una biblioteca personal —decenas de prompts, no miles— el servidor no
 * aporta nada que compense esa latencia.
 */
export function buildPromptViewModel(
  prompts: Prompt[],
  filter: string | null,
  query = '',
): PromptViewModel {
  const collections = [
    ...new Set(prompts.map((prompt) => prompt.collection).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, 'es'))
  const activeFilter = filter && collections.includes(filter) ? filter : null

  const terminos = normalizar(query).split(/\s+/).filter(Boolean)
  const porColeccion = activeFilter
    ? prompts.filter((prompt) => prompt.collection === activeFilter)
    : prompts

  return {
    activeFilter,
    collections,
    filtered:
      terminos.length > 0
        ? porColeccion.filter((prompt) => coincide(prompt, terminos))
        : porColeccion,
    searching: terminos.length > 0,
    // Las métricas describen la BIBLIOTECA, no el resultado de filtrarla: si
    // cambiaran al escribir dejarían de ser una referencia estable.
    stats: {
      total: prompts.length,
      favorites: prompts.filter((prompt) => prompt.favorite).length,
      collections: collections.length,
      totalUses: prompts.reduce((sum, prompt) => sum + prompt.useCount, 0),
    },
  }
}
