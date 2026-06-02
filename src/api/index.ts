/**
 * Barrel del cliente API.
 *
 * Antes vivía todo en `src/api.ts` (1247 LOC). En BB2 se dividió por
 * dominio. Este index.ts:
 *   1. Recompone el objeto `api` con todos los métodos (igual que antes).
 *   2. Re-exporta los types públicos que vivían sueltos en api.ts.
 *
 * Los call sites (`import { api, type ChatMessage } from '../api'`)
 * siguen funcionando sin cambios porque Node/Vite resuelve `'../api'` a
 * `src/api/index.ts`.
 */

import { aiApi } from './ai'
import { aiSettingsApi } from './ai-settings'
import { atlasApi } from './atlas'
import { chatApi } from './chat'
import { cronicasApi } from './cronicas'
import { cronologiaApi } from './cronologia'
import { entitiesApi } from './entities'
import { exportImportApi } from './export-import'
import { graphApi } from './graph'
import { healthApi } from './health'
import { homeApi } from './home'
import { momentosApi } from './momentos'
import { notesApi } from './notes'
import { notasAttachmentsApi } from './notas-attachments'
import { promptsApi } from './prompts'
import { quotesApi } from './quotes'
import { relationshipsApi } from './relationships'
import { searchApi } from './search'
import { secretsApi } from './secrets'
import { spotifyApi } from './spotify'
import { tasksApi } from './tasks'
import { typeTablesApi } from './type-tables'
import { xApi } from './x'

export const api = {
  ...entitiesApi,
  ...relationshipsApi,
  ...quotesApi,
  ...momentosApi,
  ...chatApi,
  cronicas: cronicasApi,
  notes: notesApi,
  tasks: tasksApi,
  prompts: promptsApi,
  secrets: secretsApi,
  notasAttachments: notasAttachmentsApi,
  atlas: atlasApi,
  ...cronologiaApi,
  ...aiApi,
  ...aiSettingsApi,
  ...spotifyApi,
  ...xApi,
  ...healthApi,
  ...homeApi,
  ...searchApi,
  ...graphApi,
  ...typeTablesApi,
  ...exportImportApi,
}

// ---------- Re-exports públicos ----------
//
// Los call sites importan tipos directamente desde 'src/api'. Mantenemos esa
// superficie pública intacta exportándolos desde acá. Si añadís un type
// nuevo en algún módulo de dominio, agregalo abajo.

export { DuplicateEntityError } from './request'

export type {
  WikipediaSearchResult,
  WikipediaSuggestion,
  DuplicateGroup,
  DuplicateCandidate,
} from './entities'

export type { XStatus, XBookmark, XCronica } from './x'

export type { AskResponse, ChatMessage, ChatProposal, ChatThread } from './chat'

export type { Cronica, GeneratedCronica } from './cronicas'

export type { Note } from './notes'

export type { Task, TaskCreate, TaskPatch } from './tasks'

export type { Prompt, PromptCreate, PromptPatch } from './prompts'

export type { Secret, SecretCreate, SecretKind, SecretPatch } from './secrets'

export type { NotasAttachment, NotasAttachmentOwner } from './notas-attachments'

export type { AtlasMember, AtlasConstellation, AtlasResponse } from './atlas'

export type {
  CronologiaCita,
  CronologiaMomento,
  CronologiaCronica,
  CronologiaEscucha,
  CronologiaEntrada,
  CronologiaResponse,
} from './cronologia'

export type { ProactiveSuggestion, Reclassification, ReclassifyResponse } from './ai'

export type { AISettingsResponse, AITaskConfig, AITaskKey } from './ai-settings'

export type {
  SpotifyArtistSuggestion,
  SpotifyArtistSuggestionsResponse,
  SpotifyLibrarySnapshot,
  SpotifyPlayGroup,
  SpotifyPlaylistImport,
  SpotifyPlaysResponse,
  SpotifyPlaysSummary,
  SpotifyStatus,
  SpotifyTimingResponse,
} from './spotify'

export type {
  ErrorLogEntry,
  ExtractionLogEntry,
  ExtractionLogResponse,
  HealthAlert,
  HealthResponse,
} from './health'

export type { HomeResponse } from './home'

export type {
  SearchEntityHit,
  SearchQuoteHit,
  SearchMomentoHit,
  SearchCronicaHit,
  SearchChatHit,
  SearchResponse,
} from './search'

export type { NeighborsResponse, NeighborWithHop } from './graph'

export type { MomentoUrlPreview } from './momentos'
