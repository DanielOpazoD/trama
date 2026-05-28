import type { Origin } from './origin'

/**
 * Momentos — la capa temporal de la trama (sprint ξ).
 *
 * Tres kinds: nota suelta, recorte del mundo, foto.
 *
 * El payload tiene shape variante por kind. Acá lo dejamos como tipo
 * "merged" (todos los campos opcionales) para que el cliente pueda navegar
 * cualquier momento sin discriminated union. Para VALIDACIÓN en runtime,
 * usar `src/schemas/momento.ts` con Zod — ahí están las 3 variantes
 * tipadas correctamente.
 */

export type MomentoKind = 'nota' | 'recorte' | 'foto'

export type MomentoPayload = {
  // 'nota'
  bodyText?: string
  // 'recorte'
  url?: string
  title?: string
  source?: string
  author?: string
  screenshotKey?: string
  // 'foto' — single legacy
  storageKey?: string
  width?: number
  height?: number
  caption?: string
  exifDate?: string
  /** υ-multi: array de fotos para un solo momento (un "episodio").
   *  Nuevos momentos foto SIEMPRE guardan `items`. Los antiguos siguen
   *  funcionando con `storageKey/width/height` legacy — el render lee
   *  `items` si existe; si no, cae al par single. */
  items?: Array<{
    storageKey: string
    width?: number
    height?: number
  }>
  /** Nota de voz del episodio: storageKey de un blob de audio en el
   *  mismo store `momentos-media`. Es a nivel momento (no por foto),
   *  igual que `note` de texto. Se sirve por `/api/momentos-file/:key`
   *  —el endpoint devuelve el Content-Type desde la metadata del blob,
   *  así que sirve audio sin cambios—. Solo aplica a kind='foto'. */
  audioKey?: string
}

export type Momento = {
  id: string
  kind: MomentoKind
  capturedAt: string
  payload: MomentoPayload
  note?: string
  origin: Origin
  /** Entidades vinculadas (extraídas por AI o marcadas manualmente). */
  entityIds: string[]
  createdAt: string
  updatedAt: string
}
