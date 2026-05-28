/**
 * Barrel del paquete Spotify. Split por responsabilidad:
 *   - auth.ts      OAuth, tokens, requireSpotifyConnection, perfil
 *   - sync.ts      recently-played → spotify_plays, markSynced, disconnect
 *   - playlist.ts  parseo + fetch de playlists para importación
 *   - snapshot.ts  saved/top artists/tracks + agregaciones (géneros, décadas)
 *
 * `client.ts` (constantes, readEnv, SqlClient) es plomería interna y NO se
 * re-exporta — los endpoints importan desde acá.
 */

export * from './auth.js'
export * from './sync.js'
export * from './playlist.js'
export * from './snapshot.js'
