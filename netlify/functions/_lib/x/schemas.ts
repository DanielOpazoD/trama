import { z } from 'zod'

/**
 * E5 — Schemas Zod para las respuestas de la API de X (Twitter).
 *
 * Mismo criterio que `_lib/spotify/schemas.ts`: validamos solo los campos que
 * el código consume, con `.passthrough()` para tolerar los extras del
 * proveedor. El objetivo es que un cambio de contrato de X falle ruidoso en la
 * frontera en vez de propagar `undefined` aguas abajo.
 *
 * snake_case porque es el shape crudo del proveedor.
 */

/** Token OAuth2 (intercambio de code con PKCE y refresh). `scope` es opcional:
 *  X no siempre lo reenvía. `refresh_token` aparece sólo con offline.access. */
export const XTokenResponse = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().optional(),
    token_type: z.string(),
    scope: z.string().optional(),
    expires_in: z.number(),
  })
  .passthrough()
export type XTokenResponseT = z.infer<typeof XTokenResponse>

/** `/2/users/me` — perfil de la cuenta conectada. X envuelve en `data`. */
export const XProfileResponse = z
  .object({
    data: z
      .object({
        id: z.string().min(1),
        username: z.string().min(1),
        name: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type XProfileResponseT = z.infer<typeof XProfileResponse>

/** `/2/users/:id/bookmarks` — bookmarks + usuarios expandidos en `includes`. */
export const XBookmarksResponse = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.string(),
            text: z.string(),
            created_at: z.string().optional(),
            author_id: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    includes: z
      .object({
        users: z
          .array(
            z
              .object({
                id: z.string(),
                username: z.string(),
                name: z.string().nullable().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type XBookmarksResponseT = z.infer<typeof XBookmarksResponse>
