import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { demoUnroutedGets, routeDemoRequest } from './demoRouter'
import { loadDemoStore } from './demoStore'

/**
 * Contrato entre el cliente y el router de demo.
 *
 * El router devuelve `unknown`, y una lectura desconocida cae en `[]`. Nada
 * comparaba eso con lo que los módulos de `src/api` piden, y la demo se cayó
 * tres veces por el mismo agujero (`health.auth`, `x/status.counts`, `home`).
 * Este test recorre TODAS las rutas `/api/...` que el cliente nombra, las
 * pide en GET al router con el seed cargado, y exige que ninguna termine en
 * el `default` salvo las declaradas abajo con motivo.
 *
 * Es un trinquete: una ruta nueva en `src/api` sin caso en el router falla
 * acá; una exención que ya no hace falta (la ruta ya se sirve o el cliente ya
 * no la nombra) también falla, para que la lista no se vuelva letra muerta.
 */

// Rutas que el cliente SOLO usa con POST/PATCH/DELETE (o que en demo no tienen
// lectura). Probarlas en GET caería en el default sin que sea un agujero.
export const DEMO_GET_EXEMPT = new Map<string, string>([
  // Archivos: los sirve `demoMediaResponse` en `request.ts`, antes de llegar
  // al router. Las URLs se construyen con estos prefijos, no se piden con GET.
  ['/api/momentos-file', 'URL de medio; la sirve demoMediaResponse.'],
  ['/api/library-uploads-file', 'URL de medio; la sirve demoMediaResponse.'],
  ['/api/notas-attachments-file', 'URL de medio; la sirve demoMediaResponse.'],
  ['/api/notas-attachments-file/', 'URL de medio; la sirve demoMediaResponse.'],
  ['/api/pdf-studio-saved-pdfs-file', 'URL de medio; la sirve demoMediaResponse.'],
  ['/api/recortes-image', 'URL de medio; la sirve demoMediaResponse.'],
  ['/api/recortes-image/', 'URL de medio; la sirve demoMediaResponse.'],
  // Solo escritura: el cliente nunca las pide con GET.
  ['/api/biblioteca-item/', 'Solo PATCH (renombrar, papelera, etiquetas, fijar).'],
  ['/api/import', 'Solo POST.'],
  ['/api/library-uploads', 'Solo POST (subida multipart).'],
  ['/api/library-uploads-complete', 'Solo POST.'],
  ['/api/library-uploads-presign', 'Solo POST.'],
  ['/api/momentos-audio-upload', 'Solo POST.'],
  ['/api/momentos-merge', 'Solo POST.'],
  ['/api/momentos-restore', 'Solo POST.'],
  ['/api/momentos-share-access', 'Solo DELETE.'],
  ['/api/momentos-share-access/', 'Solo PATCH/DELETE.'],
  ['/api/momentos-upload', 'Solo POST.'],
  ['/api/momentos-uploads-complete', 'Solo POST.'],
  ['/api/momentos-uploads-presign', 'Solo POST.'],
  ['/api/notas-attachments-upload', 'Solo POST.'],
  ['/api/query', 'Solo POST.'],
  ['/api/query/nl', 'Solo POST.'],
  ['/api/recortes-image-upload', 'Solo POST.'],
])

const API_DIR = join(process.cwd(), 'src/api')
const LITERAL_RE = /['"`](\/api\/[a-zA-Z0-9_\-./]*)/g

/** Quita comentarios: un path citado en un comentario no es una petición. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function clientApiPaths(): string[] {
  const paths = new Set<string>()
  for (const name of readdirSync(API_DIR)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    const source = stripComments(readFileSync(join(API_DIR, name), 'utf8'))
    for (const match of source.matchAll(LITERAL_RE)) {
      const literal = match[1]
      if (literal && literal.length > '/api/'.length) paths.add(literal)
    }
  }
  return [...paths].sort()
}

/**
 * `/api/quotes/` es el prefijo de un id interpolado; `/api/biblioteca-links/`
 * lleva `:kind/:id`. Se prueba con uno y con dos segmentos: la ruta cuenta
 * como servida si alguna variante no cae en el default.
 */
function probeVariants(path: string): string[] {
  return path.endsWith('/') ? [`${path}demo-id`, `${path}demo-id/demo-id`] : [path]
}

function landsInDefault(path: string, store: ReturnType<typeof loadDemoStore>): boolean {
  return probeVariants(path).every((variant) => {
    demoUnroutedGets.clear()
    try {
      routeDemoRequest('GET', variant, new URLSearchParams(), {}, store)
    } catch {
      // Un caso que lanza (id inexistente, acción no soportada) está ruteado.
    }
    return demoUnroutedGets.has(variant)
  })
}

describe('router de demo vs rutas del cliente', () => {
  beforeEach(() => {
    window.localStorage.clear()
    demoUnroutedGets.clear()
  })

  it('toda ruta GET que el cliente nombra tiene caso en el router, o exención con motivo', () => {
    const store = loadDemoStore()
    const paths = clientApiPaths()
    expect(paths.length).toBeGreaterThan(50)

    const unrouted = paths.filter((path) => landsInDefault(path, store))
    const holes = unrouted.filter((p) => !DEMO_GET_EXEMPT.has(p))
    const stale = [...DEMO_GET_EXEMPT.keys()].filter(
      (p) => !paths.includes(p) || !unrouted.includes(p),
    )
    expect(holes, 'rutas GET del cliente que caen en el default del router').toEqual([])
    expect(stale, 'exenciones que ya no hacen falta').toEqual([])
  })
})
