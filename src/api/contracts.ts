/**
 * Contratos de LECTURA del cliente: la forma mínima que cada consumidor
 * necesita de una respuesta GET, escrita una vez con `zod/mini`.
 *
 * Por qué existe: tres veces la demo devolvió una respuesta con la forma
 * equivocada (`health.auth`, `x/status.counts`, `home`) y la app se cayó al
 * ErrorBoundary sin que ningún test lo viera, porque el router de demo
 * devuelve `unknown` y los tipos de `src/api` solo viven en compilación. Un
 * contrato en runtime cierra eso para la demo Y para producción: el backend
 * real puede desviarse igual (una columna renombrada, un campo que ya no
 * viaja) y hoy nadie lo mira.
 *
 * Cómo se usa: `requestContract<T>('home', '/api/home')` en `request.ts`.
 * Verifica, NUNCA sustituye: la respuesta se entrega tal cual, así que los
 * esquemas son parciales a propósito (solo los campos que el cliente lee; los
 * demás pasan sin mirarse). En desarrollo y tests un desvío es un error; en
 * producción se reporta a `/api/error-log` y la app sigue.
 *
 * Costo: este módulo se carga por `import()` desde `request.ts`, después de
 * la primera respuesta verificada. No entra en la carga inicial.
 *
 * `path` es la ruta con la que la demo lo prueba (`demoRoutes.contract.test`).
 *
 * Este módulo es una HOJA: solo importa zod. Los tipos del cliente no se
 * importan acá (cerrarían un ciclo con `request.ts`); la relación
 * tipo ↔ esquema la fija `contracts.test.ts` en compilación.
 */
import * as z from 'zod/mini'

const counts3 = z.object({
  entities: z.number(),
  quotes: z.number(),
  relationships: z.number(),
})
const row = z.object({ id: z.string() })

export const CONTRACTS = {
  home: {
    path: '/api/home',
    schema: z.object({
      entities: z.array(row),
      quotes: z.array(row),
      relationships: z.array(row),
      counts: counts3,
    }),
  },
  counts: {
    path: '/api/counts',
    schema: z.object({
      entities: z.number(),
      quotes: z.number(),
      relationships: z.number(),
      momentos: z.number(),
    }),
  },
  health: {
    path: '/api/health',
    schema: z.object({
      counts: counts3,
      month: z.object({
        calls: z.number(),
        tokensIn: z.number(),
        tokensOut: z.number(),
        costCents: z.number(),
      }),
      budget: z.object({
        limitCents: z.number(),
        remainingCents: z.number(),
        pct: z.number(),
      }),
      auth: z.object({
        clerkConfigured: z.boolean(),
        legacyFallbackAllowed: z.boolean(),
        legacyOwnerMapped: z.boolean(),
        mode: z.enum(['legacy-single-user', 'clerk-with-legacy-fallback', 'clerk']),
      }),
      status: z.enum(['ok', 'degraded', 'critical']),
    }),
  },
  xStatus: {
    path: '/api/x/status',
    schema: z.discriminatedUnion('connected', [
      z.object({ connected: z.literal(false) }),
      z.object({
        connected: z.literal(true),
        needsReconnect: z.boolean(),
        username: z.nullable(z.string()),
        xUserId: z.nullable(z.string()),
        lastSyncedAt: z.nullable(z.string()),
        counts: z.object({ totalBookmarks: z.number() }),
      }),
    ]),
  },
  entityRefsCount: {
    path: '/api/entities-refs-count',
    schema: z.object({
      items: z.array(
        z.object({ id: z.string(), quoteCount: z.number(), relCount: z.number() }),
      ),
    }),
  },
  orphanedBlobs: {
    path: '/api/momentos-orphaned-blobs',
    schema: z.object({
      orphans: z.array(z.string()),
      totalInStore: z.number(),
      referenced: z.number(),
    }),
  },
  urlPreview: {
    path: '/api/momentos-url-preview?url=https%3A%2F%2Fexample.com%2F',
    schema: z.object({
      url: z.string(),
      title: z.nullable(z.string()),
      description: z.nullable(z.string()),
      source: z.nullable(z.string()),
      author: z.nullable(z.string()),
      image: z.nullable(z.string()),
      fetched: z.boolean(),
    }),
  },
  savedQueries: {
    path: '/api/saved-queries',
    schema: z.object({
      items: z.array(z.object({ id: z.string(), name: z.string(), pinned: z.boolean() })),
    }),
  },
  shareInvitations: {
    path: '/api/momentos-share-invitations',
    schema: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          inviteeEmail: z.string(),
          role: z.enum(['viewer', 'editor']),
          status: z.enum(['pending', 'accepted', 'rejected', 'cancelled']),
        }),
      ),
    }),
  },
} as const

export type ContractKey = keyof typeof CONTRACTS

/** Desvíos como `ruta.campo: motivo`; vacío si la respuesta cumple. */
export function verifyContract(key: ContractKey, data: unknown): string[] {
  const result = CONTRACTS[key].schema.safeParse(data)
  if (result.success) return []
  return result.error.issues.map(
    (issue) => `${issue.path.map(String).join('.') || '(raíz)'}: ${issue.message}`,
  )
}

/** Salida de un esquema; `contracts.test.ts` comprueba que cada tipo del cliente la cumple. */
export type ContractOutput<K extends ContractKey> = z.infer<
  (typeof CONTRACTS)[K]['schema']
>
