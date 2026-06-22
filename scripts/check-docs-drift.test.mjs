import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDocsDrift } from './check-docs-drift.mjs'

// Crea un repo mínimo que pasa todos los checks: dos endpoints, README con el
// conteo correcto y los docs sin frases obsoletas. Cada test ensucia solo la
// pieza que quiere verificar.
async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-docs-drift-'))
  mkdirSync(join(root, 'netlify/functions'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'netlify/functions/entities.mts'), 'export default {}')
  writeFileSync(join(root, 'netlify/functions/quotes.mts'), 'export default {}')
  writeFileSync(join(root, 'README.md'), '└── functions/ # 2 endpoints `.mts`')
  writeFileSync(join(root, 'docs/README.md'), '')
  writeFileSync(join(root, 'ARCHITECTURE.md'), '')
  writeFileSync(join(root, 'docs/escala.md'), '')
  return root
}

describe('checkDocsDrift', () => {
  it('rechaza cuando README documenta una cantidad vieja de endpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trama-docs-drift-'))
    mkdirSync(join(root, 'netlify/functions'), { recursive: true })
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'netlify/functions/entities.mts'), 'export default {}')
    writeFileSync(join(root, 'netlify/functions/quotes.mts'), 'export default {}')
    writeFileSync(join(root, 'README.md'), '└── functions/ # 1 endpoints `.mts`')
    writeFileSync(join(root, 'docs/README.md'), '')
    writeFileSync(join(root, 'ARCHITECTURE.md'), '')
    writeFileSync(join(root, 'docs/escala.md'), '')

    const result = checkDocsDrift(root)

    expect(result.ok).toBe(false)
    expect(result.failures.map((failure) => failure.message)).toContain(
      'README.md documents 1 Netlify endpoints, but netlify/functions has 2 `.mts` files.',
    )
  })

  it('rechaza cuando ARCHITECTURE.md cita una ruta de archivo inexistente', async () => {
    const root = await makeRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    // src/api/ existe como carpeta, pero el doc cita el viejo src/api.ts.
    mkdirSync(join(root, 'src/api'), { recursive: true })
    writeFileSync(join(root, 'src/api/transform.ts'), 'export {}')
    writeFileSync(
      join(root, 'ARCHITECTURE.md'),
      'Los transforms viven en `src/api.ts` y cruzan la frontera.',
    )

    const result = checkDocsDrift(root)

    expect(result.ok).toBe(false)
    expect(result.failures.map((failure) => failure.message)).toContain(
      'ARCHITECTURE.md cites `src/api.ts`, but that path does not exist in the repo tree.',
    )
  })

  it('acepta cuando ARCHITECTURE.md solo cita rutas reales, globs y placeholders', async () => {
    const root = await makeRepo()
    mkdirSync(join(root, 'src/api'), { recursive: true })
    mkdirSync(join(root, 'netlify/functions/_lib'), { recursive: true })
    writeFileSync(join(root, 'src/api/transform.ts'), 'export {}')
    writeFileSync(join(root, 'netlify/functions/_lib/db.ts'), 'export {}')
    writeFileSync(
      join(root, 'ARCHITECTURE.md'),
      [
        // Ruta real anclada en un root del repo.
        'Transforms en `src/api/transform.ts`.',
        // Ruta real sin prefijo completo (_lib/ resuelve bajo netlify/functions/).
        'Conexión en `_lib/db.ts`.',
        // Glob, placeholder, ruta HTTP, paquete npm, símbolo y ejemplo: ignorados.
        'Handlers `*.mts`; migración `netlify/database/migrations/<ts>_<slug>/migration.sql`.',
        'Endpoint `POST /api/extract`; paquete `@netlify/database`; tabla `entity_types`.',
        'Ejemplo de test colocado: `foo.ts` → `foo.test.ts`. Shell `App.tsx`.',
        // Traversal a directorio padre: se ignora (no se valida fuera del repo).
        'Ruta traversal `../missing.ts` no debe validarse.',
      ].join('\n'),
    )

    const result = checkDocsDrift(root)

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('valida también rutas citadas en AGENTS.md', async () => {
    const root = await makeRepo()
    writeFileSync(
      join(root, 'AGENTS.md'),
      'La lógica vive en `netlify/functions/_lib/entities-endpoint.ts`.',
    )

    const result = checkDocsDrift(root)

    expect(result.ok).toBe(false)
    expect(result.failures.map((failure) => failure.message)).toContain(
      'AGENTS.md cites `netlify/functions/_lib/entities-endpoint.ts`, but that path does not exist in the repo tree.',
    )
  })
})
