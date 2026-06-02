import { z } from 'zod'

/**
 * Schemas Zod para los endpoints administrativos / utility:
 *   - PUT  /api/ai-settings          → AISettingsUpsertBody
 *   - POST /api/entity-types         → EntityTypeUpsertBody
 *   - POST /api/relationship-types   → RelationshipTypeUpsertBody
 *   - POST /api/error-log            → ErrorLogBody
 *   - POST /api/extract              → ExtractBody
 *   - POST /api/extract-from-image   → ExtractFromImageBody
 *   - POST /api/import               → ImportBody (export v1 shape)
 *   - POST /api/spotify/import-playlist → SpotifyImportPlaylistBody
 */

/** Slug lowercase + dígitos + guión bajo (los tipos de entidad/relación). */
const TYPE_SLUG_RE = /^[a-z0-9_]+$/

export const AISettingsUpsertBody = z.object({
  task: z.string().min(1, 'task requerido'),
  provider: z.string().optional(),
  model: z.string().nullable().optional(),
  verifyWith: z.string().nullable().optional(),
})
export type AISettingsUpsertBodyT = z.infer<typeof AISettingsUpsertBody>

export const EntityTypeUpsertBody = z.object({
  slug: z
    .string()
    .min(1, 'slug requerido')
    .regex(TYPE_SLUG_RE, 'slug debe ser lowercase, números o _'),
  label: z.string().min(1, 'label requerido'),
  sort_order: z.number().optional(),
})
export type EntityTypeUpsertBodyT = z.infer<typeof EntityTypeUpsertBody>

export const RelationshipTypeUpsertBody = z.object({
  slug: z
    .string()
    .min(1, 'slug requerido')
    .regex(TYPE_SLUG_RE, 'slug debe ser lowercase, números o _'),
  label: z.string().min(1, 'label requerido'),
  reverse_label: z.string().min(1, 'reverse_label requerido'),
  sort_order: z.number().optional(),
})
export type RelationshipTypeUpsertBodyT = z.infer<typeof RelationshipTypeUpsertBody>

/** Logs de errores client-side. Aceptamos shapes laxas porque algunos
 *  campos vienen como any del catch del navegador. */
export const ErrorLogBody = z.object({
  message: z.string().min(1, 'message requerido'),
  // El tracker del cliente manda `null` (no `undefined`) cuando un campo no
  // aplica — p.ej. un error sin stack. `.nullish()` acepta string|null|undefined
  // para que el propio logueo de errores no falle con VALIDATION.
  stack: z.string().nullish(),
  componentStack: z.string().nullish(),
  path: z.string().nullish(),
  userAgent: z.string().nullish(),
  /** ErrorBoundary scope: 'root' (boundary global de la app) o
   *  'view:<viewSlug>' (boundary per-vista del ViewRouter). */
  scope: z.string().nullish(),
})
export type ErrorLogBodyT = z.infer<typeof ErrorLogBody>

export const ExtractBody = z.object({
  text: z.string().min(1, 'text requerido'),
})
export type ExtractBodyT = z.infer<typeof ExtractBody>

export const ExtractFromImageBody = z.object({
  imageBase64: z.string().min(1, 'imageBase64 requerido'),
  mimeType: z.string().min(1, 'mimeType requerido'),
})
export type ExtractFromImageBodyT = z.infer<typeof ExtractFromImageBody>

/**
 * Body de POST /api/import. Acepta el export v1 legado y el backup v2
 * estructurado; el handler procesa items uno a uno con error recovery.
 * Aquí solo verificamos shape global y que los arrays existan.
 */
export const ImportBody = z
  .object({
    version: z.union([z.literal(1), z.literal(2)], {
      message: 'Versión de export no soportada (esperado: 1 o 2)',
    }),
    entities: z.array(z.unknown()).optional(),
    relationships: z.array(z.unknown()).optional(),
    quotes: z.array(z.unknown()).optional(),
    momentos: z.array(z.unknown()).optional(),
    notes: z.array(z.unknown()).optional(),
    tasks: z.array(z.unknown()).optional(),
    prompts: z.array(z.unknown()).optional(),
    secrets: z.array(z.unknown()).optional(),
  })
  .passthrough()
export type ImportBodyT = z.infer<typeof ImportBody>

/**
 * Spotify playlist import. El handler acepta `url` o `playlistId` —
 * uno de los dos debe estar presente.
 */
export const SpotifyImportPlaylistBody = z
  .object({
    url: z.string().optional(),
    playlistId: z.string().optional(),
    maxTracks: z.number().optional(),
  })
  .refine((d) => (d.url && d.url.trim()) || (d.playlistId && d.playlistId.trim()), {
    message: 'Falta el campo "url" o "playlistId"',
  })
export type SpotifyImportPlaylistBodyT = z.infer<typeof SpotifyImportPlaylistBody>
