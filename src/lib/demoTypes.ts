export type Row = {
  id: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
  [k: string]: unknown
}
export type Store = {
  entities: Row[]
  relationships: Row[]
  quotes: Row[]
  momentos: Row[]
  notes: Row[]
  tasks: Row[]
  prompts: Row[]
  prompt_versions: Row[]
  secrets: Row[]
  notas_attachments: Row[]
  pdf_stamp_assets: Row[]
  recortes: Row[]
  favoritos: Row[]
  'reading-tables': Row[]
  momento_comments: Row[]
  momento_reactions: Row[]
  month_notes: Row[]
  x_bookmarks: Row[]
  user_prefs: Record<string, unknown>
}
