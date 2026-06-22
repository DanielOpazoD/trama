import { z } from 'zod'

/**
 * E5 — Schemas Zod para las respuestas de la API de Spotify.
 *
 * Antes estas respuestas se casteaban con `as {...}` sin validar: un cambio
 * de shape del proveedor entraba como datos no validados y propagaba
 * `undefined` silenciosos aguas abajo. Validándolas en la frontera, un
 * contrato roto del proveedor falla RUIDOSO (el `.parse()` tira y
 * `withObservability` lo loguea como 500/502) en vez de corromper datos.
 *
 * Criterio de diseño:
 *   - Solo modelamos los campos que el código realmente consume.
 *   - `.passthrough()` en los objetos: Spotify manda muchísimos extras que
 *     no nos importan; no queremos romper si agrega un campo nuevo, solo si
 *     falta o cambia de tipo uno que SÍ usamos.
 *   - snake_case porque es el shape crudo del proveedor (la conversión a
 *     camelCase la hacen los helpers que consumen estos parses).
 */

/** Token OAuth (intercambio de code y refresh). `refresh_token` es opcional:
 *  Spotify no lo reenvía en cada refresh. */
export const SpotifyTokenResponse = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().optional(),
    token_type: z.string(),
    scope: z.string(),
    expires_in: z.number(),
  })
  .passthrough()
export type SpotifyTokenResponseT = z.infer<typeof SpotifyTokenResponse>

/** Perfil del usuario (`/me`). Solo usamos id + display_name. */
export const SpotifyProfileResponse = z
  .object({
    id: z.string().min(1),
    display_name: z.string().nullable(),
  })
  .passthrough()
export type SpotifyProfileResponseT = z.infer<typeof SpotifyProfileResponse>

/** `/me/player/recently-played` — historial reciente. */
export const SpotifyRecentlyPlayedResponse = z
  .object({
    items: z.array(
      z
        .object({
          played_at: z.string(),
          track: z
            .object({
              id: z.string(),
              name: z.string(),
              duration_ms: z.number(),
              artists: z.array(
                z.object({ id: z.string(), name: z.string() }).passthrough(),
              ),
              album: z.object({ id: z.string(), name: z.string() }).passthrough(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
export type SpotifyRecentlyPlayedResponseT = z.infer<typeof SpotifyRecentlyPlayedResponse>

/** `/me/tracks?limit=1` — sólo leemos `total`. */
export const SpotifySavedTracksResponse = z
  .object({
    total: z.number().optional(),
  })
  .passthrough()
export type SpotifySavedTracksResponseT = z.infer<typeof SpotifySavedTracksResponse>

/** `/me/top/artists` — top artists con géneros. */
export const SpotifyTopArtistsResponse = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            genres: z.array(z.string()),
            popularity: z.number(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()
export type SpotifyTopArtistsResponseT = z.infer<typeof SpotifyTopArtistsResponse>

/** `/me/top/tracks` — top tracks (para décadas). */
export const SpotifyTopTracksResponse = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            artists: z.array(z.object({ name: z.string() }).passthrough()),
            album: z.object({ release_date: z.string().optional() }).passthrough(),
            popularity: z.number(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()
export type SpotifyTopTracksResponseT = z.infer<typeof SpotifyTopTracksResponse>

// ---------- Playlist import ----------

const SpotifyPlaylistTrackFull = z
  .object({
    id: z.string().nullable(),
    name: z.string(),
    duration_ms: z.number(),
    external_urls: z.object({ spotify: z.string().optional() }).passthrough(),
    artists: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          external_urls: z.object({ spotify: z.string().optional() }).passthrough(),
        })
        .passthrough(),
    ),
    album: z
      .object({
        id: z.string(),
        name: z.string(),
        release_date: z.string(),
        external_urls: z.object({ spotify: z.string().optional() }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough()

const SpotifyPlaylistTrackItem = z
  .object({
    added_at: z.string().nullable(),
    track: SpotifyPlaylistTrackFull.nullable(),
  })
  .passthrough()

/** Respuesta inicial de `/playlists/:id` (metadata + primera página). */
export const SpotifyPlaylistResponse = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    owner: z
      .object({ display_name: z.string().optional(), id: z.string() })
      .passthrough(),
    tracks: z
      .object({
        total: z.number(),
        next: z.string().nullable(),
        items: z.array(SpotifyPlaylistTrackItem),
      })
      .passthrough(),
  })
  .passthrough()
export type SpotifyPlaylistResponseT = z.infer<typeof SpotifyPlaylistResponse>

/** Página subsiguiente de tracks (`tracks.next`). */
export const SpotifyPlaylistTracksPage = z
  .object({
    items: z.array(SpotifyPlaylistTrackItem),
    next: z.string().nullable(),
  })
  .passthrough()
export type SpotifyPlaylistTracksPageT = z.infer<typeof SpotifyPlaylistTracksPage>
