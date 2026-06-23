import { z } from 'zod'

export const DbTimestampSchema = z.union([z.string(), z.date()])

export const OriginRowSchema = z
  .object({
    kind: z.string(),
    provider: z.string().optional(),
    model: z.string().optional(),
    extractionLogId: z.string().optional(),
    importedFrom: z.string().optional(),
  })
  .passthrough()

export const EntityRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  year: z.number().nullable(),
  description: z.string().nullable(),
  essay: z.string().nullable(),
  position_x: z.number().nullable(),
  position_y: z.number().nullable(),
  origin: OriginRowSchema,
  spotify_url: z.string().nullable(),
  wikipedia_url: z.string().nullable(),
  grokipedia_url: z.string().nullable(),
  created_at: DbTimestampSchema,
  updated_at: DbTimestampSchema,
})
export type EntityRow = z.infer<typeof EntityRowSchema>

export const NoteRowSchema = z.object({
  id: z.string(),
  content: z.string(),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  promoted_momento_id: z.string().nullable(),
  source: z.string().nullable(),
  created_at: DbTimestampSchema,
  updated_at: DbTimestampSchema,
  has_images: z.boolean(),
  has_audio: z.boolean(),
})
export type NoteRow = z.infer<typeof NoteRowSchema>

export const MomentoListRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  captured_at: DbTimestampSchema,
  payload: z.unknown(),
  note: z.string().nullable(),
  origin: OriginRowSchema,
  created_at: DbTimestampSchema,
  updated_at: DbTimestampSchema,
  owner_user_id: z.string(),
  owner_display_name: z.string().nullable(),
  owner_email: z.string().nullable(),
  access_role: z.enum(['owner', 'viewer', 'editor']).nullable(),
  shared: z.boolean(),
})
export type MomentoListRow = z.infer<typeof MomentoListRowSchema>

export const MomentoEntityLinkRowSchema = z.object({
  momento_id: z.string(),
  entity_id: z.string(),
})
export type MomentoEntityLinkRow = z.infer<typeof MomentoEntityLinkRowSchema>

export const SearchEntityRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  year: z.number().nullable(),
  rank: z.number(),
})
export type SearchEntityRow = z.infer<typeof SearchEntityRowSchema>

export const SearchQuoteRowSchema = z.object({
  id: z.string(),
  entity_id: z.string(),
  entity_name: z.string(),
  text: z.string(),
  source: z.string().nullable(),
  rank: z.number(),
})
export type SearchQuoteRow = z.infer<typeof SearchQuoteRowSchema>

export const SearchMomentoRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  captured_at: DbTimestampSchema,
  text: z.string(),
  rank: z.number(),
})
export type SearchMomentoRow = z.infer<typeof SearchMomentoRowSchema>

export const SearchCronicaRowSchema = z.object({
  id: z.string(),
  year: z.number(),
  month: z.number(),
  text: z.string(),
  rank: z.number(),
})
export type SearchCronicaRow = z.infer<typeof SearchCronicaRowSchema>

export const SearchChatRowSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  thread_title: z.string().nullable(),
  role: z.string(),
  text: z.string(),
  rank: z.number(),
})
export type SearchChatRow = z.infer<typeof SearchChatRowSchema>

export const SearchSemanticEntityRowSchema = SearchEntityRowSchema.extend({
  distance: z.number(),
})
export type SearchSemanticEntityRow = z.infer<typeof SearchSemanticEntityRowSchema>

export const SearchSemanticQuoteRowSchema = SearchQuoteRowSchema.extend({
  distance: z.number(),
})
export type SearchSemanticQuoteRow = z.infer<typeof SearchSemanticQuoteRowSchema>

export const SearchSemanticMomentoRowSchema = SearchMomentoRowSchema.extend({
  distance: z.number(),
})
export type SearchSemanticMomentoRow = z.infer<typeof SearchSemanticMomentoRowSchema>
