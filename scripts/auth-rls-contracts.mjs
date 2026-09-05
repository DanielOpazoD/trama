#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'

export const PRIVATE_TABLE_CONTRACTS = [
  {
    table: 'ai_task_providers',
    lifecycle: 'singleton',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped provider settings by user and task',
    reason: 'AI provider preferences change model behavior and cost per account.',
  },
  {
    table: 'api_tokens',
    lifecycle: 'token',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped extension token material',
    reason: 'PATs authorize extension writes and must never cross users.',
  },
  {
    table: 'atlas_snapshots',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped atlas snapshot history',
    reason: 'Atlas snapshots serialize private graph state for one user.',
  },
  {
    table: 'chat_messages',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped chat thread messages',
    reason: 'Chat text can contain raw private context and extracted knowledge.',
  },
  {
    table: 'chat_threads',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped chat conversations',
    reason: 'Threads group private messages and retrieval context by account.',
  },
  {
    table: 'cronicas',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped chronicle entries',
    reason: 'Cronicas are generated private narrative material per user.',
  },
  {
    table: 'entities',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped graph entities',
    reason: 'Entities are the primary private graph nodes for each user.',
  },
  {
    table: 'error_log',
    lifecycle: 'append-only',
    userId: 'required',
    rls: 'required',
    ownership: 'log scoped to the request owner or explicit system path',
    reason: 'Operational errors can include account-specific request context.',
  },
  {
    table: 'extraction_log',
    lifecycle: 'append-only',
    userId: 'required',
    rls: 'required',
    ownership: 'log scoped to the user who triggered extraction',
    reason: 'LLM extraction logs drive costs and can reference private input.',
  },
  {
    table: 'favoritos',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped favorite shortcuts',
    reason: 'Favorites reveal private navigation and selected objects.',
  },
  {
    table: 'library_item_overrides',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership:
      'owner scoped Library metadata (rename, tags, pinned, AI status, trash) over existing assets',
    reason:
      'Decorates private files with per-user titles and a Library-level soft-delete without touching the source rows.',
  },
  {
    table: 'library_item_links',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership:
      'owner scoped connections between a Library file and entities/notes/momentos',
    reason:
      'Links reveal private relationships between a file and the user objects it appears in.',
  },
  {
    table: 'momento_access',
    lifecycle: 'join',
    userId: 'required',
    rls: 'required',
    ownership: 'shared space access granted between users',
    reason: 'Shared Momentos require explicit access rows and reciprocal policy checks.',
  },
  {
    table: 'momento_comments',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'shared moment comment owned by author and guarded by space access',
    reason: 'Comments combine private authorship with controlled shared visibility.',
  },
  {
    table: 'momento_entities',
    lifecycle: 'join',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped links between Momentos and entities',
    reason: 'Entity links expose private classification and graph context.',
  },
  {
    table: 'momento_reactions',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'shared moment reaction owned by author and guarded by space access',
    reason: 'Reactions are small but still reveal private activity in shared spaces.',
  },
  {
    table: 'momentos',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped moment with optional shared-space visibility',
    reason: 'Momentos contain private text, dates, media keys and inferred entities.',
  },
  {
    table: 'month_notes',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped monthly notes',
    reason: 'Monthly notes are private narrative state grouped by date.',
  },
  {
    table: 'notas_attachments',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped attachment metadata with blob owner validation',
    reason: 'Attachment rows point to private blob storage keys.',
  },
  {
    table: 'notes',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped private note documents',
    reason: 'Notes are one of the highest-sensitivity writing surfaces.',
  },
  {
    table: 'pdf_studio_saved_pdfs',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped saved PDF studio documents',
    reason: 'Saved PDFs and edits are private document work products.',
  },
  {
    table: 'pdf_studio_templates',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped editable PDF template packages',
    reason: 'Template structure reveals private clinical/document workflows per user.',
  },
  {
    table: 'pdf_studio_template_versions',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped history of editable PDF template packages',
    reason: 'Old template versions reveal the same private workflows as the head.',
  },
  {
    table: 'pdf_stamp_assets',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped PDF Studio signatures and stamps',
    reason: 'Signatures and stamps are private identity marks that must not cross users.',
  },
  {
    table: 'proactive_suggestions',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped generated suggestions',
    reason: 'Suggestions are generated from private graph and note context.',
  },
  {
    table: 'prompts',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped prompt library',
    reason: 'Prompts can encode private workflow and reusable instructions.',
  },
  {
    table: 'prompt_versions',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped history of the prompt library',
    reason: 'Old prompt versions encode the same private workflow as the head.',
  },
  {
    table: 'quotes',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped quotes tied to owned entities',
    reason: 'Quotes expose private reading, annotations and entity links.',
  },
  {
    table: 'reading_tables',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped reading table rows',
    reason: 'Reading tables collect private sources and curation state.',
  },
  {
    table: 'recorte_images',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped recorte image metadata',
    reason: 'Image rows reference private captured media and thumbnails.',
  },
  {
    table: 'recortes',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped web capture inbox',
    reason: 'Recortes contain private captured text, source URLs and media keys.',
  },
  {
    table: 'relationships',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped graph relationships',
    reason: 'Relationships expose private meaning between owned entities.',
  },
  {
    table: 'saved_queries',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped saved search queries',
    reason: 'Saved queries reveal private research intent and graph navigation.',
  },
  {
    table: 'secrets',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped encrypted secret metadata',
    reason: 'Secrets are explicitly private and must remain isolated per account.',
  },
  {
    table: 'spotify_plays',
    lifecycle: 'append-only',
    userId: 'required',
    rls: 'required',
    ownership: 'event stream scoped to the connected Spotify user',
    reason: 'Listening history is private behavioral data.',
  },
  {
    table: 'spotify_tokens',
    lifecycle: 'token',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped Spotify OAuth tokens',
    reason: 'OAuth refresh tokens must be isolated to their account owner.',
  },
  {
    table: 'storage_assets',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped blob manifest across storage providers and domains',
    reason:
      'Blob metadata connects private binary objects to owners before any storage provider migration.',
  },
  {
    table: 'tasks',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped task rows and workflow state',
    reason: 'Tasks can reveal personal obligations and private project context.',
  },
  {
    table: 'user_prefs',
    lifecycle: 'singleton',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped UI preferences and world defaults',
    reason: 'Preferences drive per-user surfaces and should not leak across browsers.',
  },
  {
    table: 'web_vitals_samples',
    lifecycle: 'append-only',
    userId: 'required',
    rls: 'required',
    ownership: 'metric scoped to authenticated user or explicit anonymous rejection',
    reason: 'Vitals are operational but still tied to private user sessions.',
  },
  {
    table: 'whatsapp_events',
    lifecycle: 'append-only',
    userId: 'required',
    rls: 'required',
    ownership: 'event scoped to resolved WhatsApp link owner',
    reason: 'Webhook events include sender metadata and captured message state.',
  },
  {
    table: 'whatsapp_links',
    lifecycle: 'token',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped WhatsApp phone binding',
    reason: 'Phone bindings decide which account receives incoming captures.',
  },
  {
    table: 'whatsapp_pending_media',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped pending WhatsApp media awaiting destination',
    reason:
      'Pending media stores private photo references before the user chooses a destination.',
  },
  {
    table: 'whatsapp_processed_messages',
    lifecycle: 'append-only',
    userId: 'required',
    rls: 'required',
    ownership: 'event scoped to resolved WhatsApp message owner',
    reason: 'Processed message ids prevent replay and are tied to private captures.',
  },
  {
    table: 'x_bookmarks',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped X bookmarks',
    reason: 'Bookmarks reveal private reading and social graph context.',
  },
  {
    table: 'x_cronicas',
    lifecycle: 'soft-delete',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped generated X chronicles',
    reason: 'Generated chronicles summarize private imported X activity.',
  },
  {
    table: 'x_tokens',
    lifecycle: 'token',
    userId: 'required',
    rls: 'required',
    ownership: 'owner scoped X OAuth tokens',
    reason: 'OAuth token storage must be isolated per connected account.',
  },
]

export const ENDPOINT_PRIVACY_CONTRACTS = [
  {
    route: '/api/entities',
    files: [
      'netlify/functions/entities.mts',
      'netlify/functions/_lib/entities-endpoint.ts',
    ],
    auth: 'required',
    operations: ['list', 'read', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['entities', 'relationships', 'quotes', 'momento_entities'],
    ownership:
      'Every entity mutation scopes by user_id and validates owned related rows.',
    evidence: [
      'netlify/functions/_lib/isolation-guardrail.test.ts',
      'e2e/multi-user-isolation.spec.ts',
    ],
  },
  {
    route: '/api/quotes',
    files: ['netlify/functions/quotes.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['quotes', 'entities'],
    ownership:
      'Quotes are private rows and incoming entity ids must belong to the same user.',
    evidence: [
      'netlify/functions/_lib/isolation-quotes.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/notes',
    files: ['netlify/functions/notes.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['notes', 'notas_attachments'],
    ownership:
      'Notes scope by owner and cascade private attachment state through backend only.',
    evidence: [
      'netlify/functions/_lib/notes-endpoint.test.ts',
      'e2e/multi-user-isolation.spec.ts',
    ],
  },
  {
    route: '/api/recortes',
    files: [
      'netlify/functions/recortes.mts',
      'netlify/functions/_lib/recortes-endpoint.ts',
    ],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore', 'promote'],
    tables: ['recortes', 'recorte_images', 'entities', 'quotes', 'momentos'],
    ownership:
      'Recortes are an owner-scoped inbox; promotion validates owned targets and writes user_id.',
    evidence: [
      'netlify/functions/_lib/recortes-endpoint.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/momentos',
    files: [
      'netlify/functions/momentos.mts',
      'netlify/functions/_lib/momentos-endpoint.ts',
    ],
    auth: 'required',
    operations: ['list', 'read', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['momentos', 'momento_entities', 'momento_access'],
    ownership: 'Momentos are owner-scoped with explicit shared-space access policies.',
    evidence: [
      'netlify/functions/_lib/momentos-endpoint.test.ts',
      'e2e/multi-user-isolation.spec.ts',
    ],
  },
  {
    route: '/api/notas-feed',
    files: ['netlify/functions/notas-feed.mts'],
    auth: 'required',
    operations: ['list'],
    tables: ['notes', 'recortes', 'notas_attachments'],
    ownership:
      'Feed rows are assembled only from the authenticated user private surfaces.',
    evidence: [
      'netlify/functions/_lib/notas-feed.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/search',
    files: ['netlify/functions/search.mts', 'netlify/functions/_lib/search-endpoint.ts'],
    auth: 'required',
    operations: ['query'],
    tables: ['entities', 'quotes', 'momentos', 'notes', 'recortes', 'chat_threads'],
    ownership:
      'Search is a read surface and every branch scopes by authenticated user_id.',
    evidence: [
      'netlify/functions/_lib/search-endpoint.test.ts',
      'e2e/multi-user-isolation.spec.ts',
    ],
  },
  {
    route: '/api/notas-attachments',
    files: ['netlify/functions/notas-attachments.mts'],
    auth: 'required',
    operations: ['list', 'soft-delete'],
    tables: ['notas_attachments', 'notes', 'prompts'],
    ownership: 'Attachment metadata validates active owner rows before list/delete.',
    evidence: [
      'netlify/functions/_lib/notas-attachments-endpoint.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/pdf-studio-saved-pdfs-file/:key',
    files: ['netlify/functions/pdf-studio-saved-pdfs-file.mts'],
    auth: 'required',
    operations: ['download'],
    tables: ['pdf_studio_saved_pdfs'],
    ownership:
      'Blob download first checks the storage key namespace and then resolves the live row under user_id.',
    evidence: ['netlify/functions/_lib/pdf-studio-saved-pdfs-file-endpoint.test.ts'],
  },
  {
    route: '/api/notas-attachments-file/:key',
    files: ['netlify/functions/notas-attachments-file.mts'],
    auth: 'required',
    operations: ['download'],
    tables: ['notas_attachments', 'notes', 'prompts'],
    ownership: 'Blob download first resolves metadata and active owner under user_id.',
    evidence: [
      'netlify/functions/_lib/notas-attachments-file-endpoint.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/recortes-image/:userId/:key',
    files: ['netlify/functions/recortes-image.mts'],
    auth: 'required',
    operations: ['download'],
    tables: ['recorte_images', 'recortes'],
    ownership:
      'Recorte media is namespaced by owner and must match the authenticated user.',
    evidence: [
      'netlify/functions/_lib/recortes-image-endpoint.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/momentos-file/:userId/:key',
    files: ['netlify/functions/momentos-file.mts'],
    auth: 'required',
    operations: ['download'],
    tables: ['momentos'],
    ownership:
      'Momento media download is private unless shared-space access authorizes it.',
    evidence: [
      'netlify/functions/_lib/momentos-file-endpoint.test.ts',
      'scripts/smoke-isolation.mjs',
    ],
  },
  {
    route: '/api/chat-threads',
    files: ['netlify/functions/chat-threads.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete'],
    tables: ['chat_threads', 'chat_messages'],
    ownership: 'Chat thread list and mutation remain scoped to the authenticated owner.',
    evidence: [
      'netlify/functions/_lib/chat-threads-boundary.test.ts',
      'netlify/functions/_lib/chat-user-isolation.test.ts',
    ],
  },
  {
    route: '/api/chat-messages',
    files: ['netlify/functions/chat-messages.mts'],
    auth: 'required',
    operations: ['list', 'send', 'stream'],
    tables: ['chat_threads', 'chat_messages', 'entities', 'relationships'],
    ownership:
      'Message reads and AI sends validate the target thread belongs to the user.',
    evidence: [
      'netlify/functions/_lib/chat-messages-endpoint.test.ts',
      'netlify/functions/_lib/chat-user-isolation.test.ts',
    ],
  },
  {
    route: '/api/tasks',
    files: ['netlify/functions/tasks.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['tasks'],
    ownership: 'Task rows are private workflow state scoped to the authenticated owner.',
    evidence: ['netlify/functions/_lib/tasks-endpoint.test.ts'],
  },
  {
    route: '/api/prompts',
    files: ['netlify/functions/prompts.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore', 'history'],
    tables: ['prompts', 'prompt_versions', 'notas_attachments'],
    ownership:
      'Prompt library rows, their version history and prompt attachments are scoped to the owner.',
    evidence: ['netlify/functions/_lib/prompts-endpoint.test.ts'],
  },
  {
    route: '/api/favoritos',
    files: ['netlify/functions/favoritos.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['favoritos'],
    ownership: 'Favorites expose private navigation shortcuts and are owner scoped.',
    evidence: ['netlify/functions/_lib/favoritos-endpoint.test.ts'],
  },
  {
    route: '/api/user-prefs',
    files: ['netlify/functions/user-prefs.mts'],
    auth: 'required',
    operations: ['read', 'upsert'],
    tables: ['user_prefs'],
    ownership: 'Preferences are one JSON document per authenticated user.',
    evidence: ['netlify/functions/_lib/user-prefs-endpoint.test.ts'],
  },
  {
    route: '/api/reading-tables',
    files: ['netlify/functions/reading-tables.mts'],
    auth: 'required',
    operations: ['list', 'create', 'update', 'soft-delete', 'restore'],
    tables: ['reading_tables'],
    ownership: 'Reading table entries are private curation state scoped by owner.',
    evidence: ['netlify/functions/_lib/reading-tables-endpoint.test.ts'],
  },
  {
    route: '/api/saved-queries',
    files: ['netlify/functions/saved-queries.mts'],
    auth: 'required',
    operations: ['list', 'create', 'delete'],
    tables: ['saved_queries'],
    ownership: 'Saved queries reveal private research intent and remain owner scoped.',
    evidence: ['netlify/functions/_lib/saved-queries-endpoint.test.ts'],
  },
  {
    route: '/api/pdf-studio-saved-pdfs',
    files: ['netlify/functions/pdf-studio-saved-pdfs.mts'],
    auth: 'required',
    operations: ['list', 'upload', 'download', 'delete'],
    tables: ['pdf_studio_saved_pdfs'],
    ownership:
      'Saved PDFs and blob payloads are validated against the authenticated owner.',
    evidence: ['netlify/functions/_lib/pdf-studio-saved-pdfs-endpoint.test.ts'],
  },
  {
    route: '/api/pdf-studio-templates',
    files: [
      'netlify/functions/pdf-studio-templates.mts',
      'netlify/functions/_lib/pdf-studio-templates-endpoint.ts',
    ],
    auth: 'required',
    operations: ['list', 'upload', 'download', 'versions', 'delete'],
    tables: ['pdf_studio_templates', 'pdf_studio_template_versions'],
    ownership:
      'Editable template packages, their version history and blob payloads are scoped to the authenticated owner.',
    evidence: ['netlify/functions/_lib/pdf-studio-templates-endpoint.test.ts'],
  },
  {
    route: '/api/pdf-stamp-assets',
    files: [
      'netlify/functions/pdf-stamp-assets.mts',
      'netlify/functions/_lib/pdf-stamp-assets-endpoint.ts',
    ],
    auth: 'required',
    operations: ['list', 'create', 'update', 'touch', 'soft-delete'],
    tables: ['pdf_stamp_assets'],
    ownership: 'PDF Studio signatures and stamps are visible only to their owner.',
    evidence: ['netlify/functions/_lib/pdf-stamp-assets-endpoint.test.ts'],
  },
  {
    route: '/api/api-tokens',
    files: ['netlify/functions/api-tokens.mts'],
    auth: 'required',
    operations: ['list', 'create', 'revoke'],
    tables: ['api_tokens'],
    ownership: 'Extension personal tokens are created and revoked only for their owner.',
    evidence: ['netlify/functions/_lib/recortes-endpoint.test.ts'],
  },
  {
    route: '/api/proactive-suggestions',
    files: ['netlify/functions/proactive-suggestions.mts'],
    auth: 'required',
    operations: ['list', 'generate', 'dismiss'],
    tables: ['proactive_suggestions', 'entities', 'relationships'],
    ownership: 'Generated suggestions are derived from and stored under the user graph.',
    evidence: [
      'netlify/functions/_lib/proactive-suggestions-boundary.test.ts',
      'netlify/functions/_lib/proactive-suggestions-endpoint.test.ts',
    ],
  },
  {
    route: '/api/whatsapp-link',
    files: ['netlify/functions/whatsapp-link.mts'],
    auth: 'required',
    operations: ['read', 'create', 'delete'],
    tables: ['whatsapp_links'],
    ownership:
      'WhatsApp link codes and phone bindings belong to the authenticated owner.',
    evidence: ['netlify/functions/_lib/whatsapp-link-endpoint.test.ts'],
  },
  {
    route: '/api/whatsapp-webhook',
    files: ['netlify/functions/whatsapp-webhook.mts'],
    auth: 'webhook-signature',
    operations: ['ingest'],
    tables: ['whatsapp_links', 'whatsapp_events', 'whatsapp_processed_messages'],
    ownership: 'Twilio-signed inbound messages resolve the owner by active phone link.',
    evidence: ['netlify/functions/_lib/whatsapp-webhook-endpoint.test.ts'],
  },
  {
    route: '/api/spotify-plays',
    files: ['netlify/functions/spotify-plays.mts'],
    auth: 'required',
    operations: ['list'],
    tables: ['spotify_plays'],
    ownership: 'Spotify listening history is returned only for the authenticated owner.',
    evidence: ['netlify/functions/_lib/spotify-plays-endpoint.test.ts'],
  },
  {
    route: '/api/x-bookmarks',
    files: ['netlify/functions/x-bookmarks.mts'],
    auth: 'required',
    operations: ['list', 'delete'],
    tables: ['x_bookmarks'],
    ownership: 'X bookmarks are imported private reading state scoped by owner.',
    evidence: ['netlify/functions/_lib/x-bookmarks-endpoint.test.ts'],
  },
  {
    route: '/api/x-cronica',
    files: ['netlify/functions/x-cronica.mts'],
    auth: 'required',
    operations: ['generate', 'read'],
    tables: ['x_cronicas', 'x_bookmarks', 'extraction_log'],
    ownership: 'Generated X chronicles and source bookmarks are owner scoped.',
    evidence: ['netlify/functions/_lib/x-cronica-endpoint.test.ts'],
  },
]

export const SMOKE_DOMAIN_CONTRACTS = [
  {
    domain: 'auth',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['anonymous request to /api/entities returns 401'],
  },
  {
    domain: 'revoked-token',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['revoked token returns 401 when provided'],
  },
  {
    domain: 'entities',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list/open/edit/delete an entity created by A'],
  },
  {
    domain: 'quotes',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list/search/edit/delete a quote created by A'],
  },
  {
    domain: 'notes',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list/edit/delete a note created by A'],
  },
  {
    domain: 'recortes',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list/edit/delete a recorte created by A'],
  },
  {
    domain: 'notas-feed',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot discover A fixtures through the feed surface'],
  },
  {
    domain: 'search',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot discover A fixtures through global search'],
  },
  {
    domain: 'attachments',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list or delete A note attachments'],
  },
  {
    domain: 'blobs',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot download A attachment or private media blobs'],
  },
  {
    domain: 'pdf-stamp-assets',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list/edit/delete PDF signatures or stamps created by A'],
  },
  {
    domain: 'momentos',
    command: 'npm run smoke:multiuser:prod',
    assertions: ['B cannot list/open/edit/delete a Momento created by A without sharing'],
  },
]

export function buildAuthRlsReport() {
  return {
    privateTables: PRIVATE_TABLE_CONTRACTS.length,
    privateEndpoints: ENDPOINT_PRIVACY_CONTRACTS.length,
    smokeDomains: SMOKE_DOMAIN_CONTRACTS.map((contract) => contract.domain),
    acceptance: [
      'anonymous_401',
      'revoked_401',
      'read_isolation',
      'mutation_isolation',
      'blob_isolation',
    ],
  }
}

function allMigrationSql() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = join(repoRoot, 'netlify/database/migrations')
  return readdirSync(migrationsDir)
    .sort()
    .map((dir) => readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8'))
    .join('\n')
}

function migrationTablesWithUserId(sql) {
  const tables = new Set()
  const createTableRe =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_]+)\s*\(([\s\S]*?)\);/gi
  let createMatch
  while ((createMatch = createTableRe.exec(sql))) {
    if (/\buser_id\b/i.test(createMatch[2])) tables.add(createMatch[1])
  }

  const alterAddUserIdRe =
    /ALTER\s+TABLE\s+([a-z_]+)\s+[^;]*\bADD\s+COLUMN\s+user_id\b[^;]*;/gi
  let alterMatch
  while ((alterMatch = alterAddUserIdRe.exec(sql))) tables.add(alterMatch[1])
  return [...tables].sort()
}

/**
 * Estado real de RLS por tabla en las migraciones. Aislamiento efectivo exige
 * las tres: ENABLE (activa RLS), FORCE (la aplica también al owner de la tabla
 * — la app conecta como owner, sin FORCE el RLS se bypassa) y al menos una
 * POLICY QUE AÍSLE. Una policy permisiva (`USING (true)`) habilita RLS sin
 * aislar nada, así que solo cuenta si su cuerpo engancha el contexto de
 * usuario (`current_setting('app.current_user_id', …)`) — eso descarta las
 * permisivas pero admite todas las formas reales del repo (patrón inline,
 * `trama_user_isolation` multilínea, políticas por-operación `_own` y las
 * compartidas de Momentos). Se quitan comentarios SQL antes de parsear para no
 * contar sentencias comentadas. Devuelve un set por cada pieza.
 */
function migrationRlsState(sql) {
  const executableSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const enable = new Set()
  const force = new Set()
  const policy = new Set()
  const enableRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi
  const forceRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z0-9_]+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi
  // Captura el cuerpo de la policy (hasta el primer ';') para inspeccionar su
  // predicado, no solo su existencia.
  const policyRe = /CREATE\s+POLICY\s+[a-z0-9_]+\s+ON\s+([a-z0-9_]+)([\s\S]*?);/gi
  let m
  while ((m = enableRe.exec(executableSql))) enable.add(m[1])
  while ((m = forceRe.exec(executableSql))) force.add(m[1])
  while ((m = policyRe.exec(executableSql))) {
    const isolatesByUser = /current_setting\s*\(\s*'app\.current_user_id'/i.test(m[2])
    if (isolatesByUser) policy.add(m[1])
  }
  return { enable, force, policy }
}

/**
 * RATCHET de implementación de RLS. Tablas `rls:'required'` cuya RLS real
 * (ENABLE+FORCE+POLICY en migraciones) AÚN no aterriza, con el motivo. El gate
 * (`validateAuthRlsContracts`) usa este allowlist para distinguir "backlog
 * conocido" de "regresión". Reglas que fuerza el gate:
 *   - una tabla required SIN RLS y que NO esté aquí ⇒ error (cierra el gap
 *     contrato↔realidad: declarar `rls:'required'` ya no basta).
 *   - una tabla aquí cuya RLS YA aterrizó ⇒ error (obliga a quitarla; el
 *     ratchet solo baja).
 *   - una tabla con RLS a medias (ENABLE sin FORCE/POLICY) ⇒ error siempre.
 * Meta: este objeto vacío.
 */
export const RLS_IMPLEMENTATION_BACKLOG = {
  // Vacío: las 44 tablas rls:'required' tienen RLS real (ENABLE+FORCE+POLICY).
  // Cimiento #1 completo. Toda tabla nueva rls:'required' debe nacer con RLS o
  // el gate falla — ya no hay allowlist donde esconderse.
}

export function validateAuthRlsContracts({
  migrationSql = allMigrationSql(),
  privateTableContracts = PRIVATE_TABLE_CONTRACTS,
  rlsBacklog = RLS_IMPLEMENTATION_BACKLOG,
} = {}) {
  const migrationTables = migrationTablesWithUserId(migrationSql)
  const contractByTable = new Map(
    privateTableContracts.map((contract) => [contract.table, contract]),
  )
  const missingPrivateTables = migrationTables.filter(
    (table) => !contractByTable.has(table),
  )
  const malformedPrivateTables = privateTableContracts
    .filter(
      (contract) =>
        contract.userId !== 'required' ||
        contract.rls !== 'required' ||
        !['soft-delete', 'append-only', 'singleton', 'token', 'join'].includes(
          contract.lifecycle,
        ) ||
        typeof contract.ownership !== 'string' ||
        contract.ownership.length <= 20 ||
        typeof contract.reason !== 'string' ||
        contract.reason.length <= 20,
    )
    .map((contract) => contract.table)
    .sort()

  // Verificación de la IMPLEMENTACIÓN real de RLS (no solo la declaración).
  // Cada contrato rls:'required' debe tener ENABLE+FORCE+POLICY en migraciones,
  // salvo que esté en el backlog (ratchet). Cierra el gap contrato↔realidad.
  const rlsState = migrationRlsState(migrationSql)
  const requiredContracts = privateTableContracts.filter(
    (contract) => contract.rls === 'required',
  )
  const unprotectedTables = []
  const partialRlsTables = []
  const staleRlsBacklog = []
  for (const contract of requiredContracts) {
    const table = contract.table
    const hasEnable = rlsState.enable.has(table)
    const hasForce = rlsState.force.has(table)
    const hasPolicy = rlsState.policy.has(table)
    const full = hasEnable && hasForce && hasPolicy
    const none = !hasEnable && !hasForce && !hasPolicy
    const allowed = Object.prototype.hasOwnProperty.call(rlsBacklog, table)
    if (full) {
      if (allowed) staleRlsBacklog.push(table)
      continue
    }
    if (none) {
      if (allowed) continue
      unprotectedTables.push(table)
      continue
    }
    // Estado a medias: ENABLE sin FORCE o sin POLICY. Nunca aceptable, ni en
    // backlog (deja la tabla legible por el owner o en deny-all).
    const missing = [!hasEnable && 'ENABLE', !hasForce && 'FORCE', !hasPolicy && 'POLICY']
      .filter(Boolean)
      .join('+')
    partialRlsTables.push(`${table} (falta ${missing})`)
  }

  const messages = [
    ...missingPrivateTables.map(
      (table) => `${table} tiene user_id pero no está en PRIVATE_TABLE_CONTRACTS.`,
    ),
    ...malformedPrivateTables.map(
      (table) =>
        `${table} está en PRIVATE_TABLE_CONTRACTS pero le falta lifecycle, ownership o razón operacional.`,
    ),
    ...unprotectedTables.map(
      (table) =>
        `${table} declara rls:'required' pero no tiene ENABLE+FORCE+POLICY ROW LEVEL SECURITY en migraciones (ni está en RLS_IMPLEMENTATION_BACKLOG).`,
    ),
    ...partialRlsTables.map(
      (entry) =>
        `${entry} tiene RLS a medias en migraciones; debe ser ENABLE+FORCE+POLICY.`,
    ),
    ...staleRlsBacklog.map(
      (table) =>
        `${table} ya tiene RLS implementada; quítala de RLS_IMPLEMENTATION_BACKLOG (el ratchet solo baja).`,
    ),
  ]

  return {
    ok: messages.length === 0,
    missingPrivateTables,
    malformedPrivateTables,
    unprotectedTables,
    partialRlsTables,
    staleRlsBacklog,
    messages,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = buildAuthRlsReport()
  const validation = validateAuthRlsContracts()
  console.log(JSON.stringify(report, null, 2))
  if (!validation.ok) {
    for (const message of validation.messages) console.error(message)
    process.exit(1)
  }
}
