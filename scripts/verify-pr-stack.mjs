#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const prStack = [
  {
    id: 'pr1-auth-isolation',
    title: 'Auth, provisioning y aislamiento P0',
    patterns: [
      /^netlify\/functions\/_lib\/auth\.test\.ts$/,
      /^netlify\/functions\/_lib\/auth\.ts$/,
      /^netlify\/functions\/_lib\/ai-mode(\.test)?\.ts$/,
      /^netlify\/functions\/_lib\/ai-tasks(-boundary\.test)?\.ts$/,
      /^netlify\/functions\/_lib\/ask-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/chat-threads-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/chat-context\.ts$/,
      /^netlify\/functions\/_lib\/chat-messages-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/chat-messages-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/chat-user-isolation\.test\.ts$/,
      /^netlify\/functions\/_lib\/entities-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/entities-merge-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/error-log-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/error-log-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/health-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/import-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/isolation-(momentos|quotes|relationships)\.test\.ts$/,
      /^netlify\/functions\/_lib\/momentos-endpoint(-boundary)?\.test\.ts$/,
      /^netlify\/functions\/_lib\/momentos-merge-(endpoint|boundary)\.test\.ts$/,
      /^netlify\/functions\/_lib\/momentos-orphaned-blobs-(endpoint|boundary)\.test\.ts$/,
      /^netlify\/functions\/_lib\/momentos-restore-(endpoint|boundary)\.test\.ts$/,
      /^netlify\/functions\/_lib\/notes-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/quote-schemas\.ts$/,
      /^netlify\/functions\/_lib\/quotes-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/relationships-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/search-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/spotify-oauth\.test\.ts$/,
      /^netlify\/functions\/_lib\/spotify-sql-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/spotify\/auth\.ts$/,
      /^netlify\/functions\/_lib\/spotify\/sync\.ts$/,
      /^netlify\/functions\/_lib\/tasks-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/user-provisioning\.ts$/,
      /^netlify\/functions\/_lib\/web-vitals-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/x-oauth\.test\.ts$/,
      /^netlify\/functions\/_lib\/x-scheduled-sync-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/x-status-boundary\.test\.ts$/,
      /^netlify\/functions\/ask\.mts$/,
      /^netlify\/functions\/chat-messages\.mts$/,
      /^netlify\/functions\/chat-threads\.mts$/,
      /^netlify\/functions\/cronologia\.mts$/,
      /^netlify\/functions\/entities-merge\.mts$/,
      /^netlify\/functions\/entities\.mts$/,
      /^netlify\/functions\/error-log\.mts$/,
      /^netlify\/functions\/health\.mts$/,
      /^netlify\/functions\/import\.mts$/,
      /^netlify\/functions\/momentos-(audio-upload|file|merge|orphaned-blobs|restore)\.mts$/,
      /^netlify\/functions\/momentos\.mts$/,
      /^netlify\/functions\/notes\.mts$/,
      /^netlify\/functions\/quotes\.mts$/,
      /^netlify\/functions\/relationships\.mts$/,
      /^netlify\/functions\/search\.mts$/,
      /^netlify\/functions\/spotify-callback\.mts$/,
      /^netlify\/functions\/spotify-scheduled-sync\.mts$/,
      /^netlify\/functions\/spotify-status\.mts$/,
      /^netlify\/functions\/tasks\.mts$/,
      /^netlify\/functions\/web-vitals\.mts$/,
      /^netlify\/functions\/x-callback\.mts$/,
      /^netlify\/functions\/x-scheduled-sync\.mts$/,
      /^netlify\/functions\/x-status\.mts$/,
    ],
  },
  {
    id: 'pr2-db-integrity',
    title: 'Migracion de integridad',
    patterns: [
      /^netlify\/database\/migrations\/20260531090000_user_fk_integrity\/migration\.sql$/,
      /^scripts\/apply-migrations\.sh$/,
    ],
  },
  {
    id: 'pr3-llm-cost-observability',
    title: 'Costos LLM y observabilidad',
    patterns: [
      /^netlify\/functions\/_lib\/cost-(alert-check-(endpoint|boundary)\.test|cap(-boundary)?(\.test)?)\.ts$/,
      /^netlify\/functions\/_lib\/embeddings(\.test)?\.ts$/,
      /^netlify\/functions\/_lib\/env\.ts$/,
      /^netlify\/functions\/_lib\/llm\/dispatch\.ts$/,
      /^netlify\/functions\/_lib\/llm\/db-cache(-boundary\.test)?\.ts$/,
      /^netlify\/functions\/_lib\/llm\/providers\/openai-compatible(\.test)?\.ts$/,
      /^netlify\/functions\/_lib\/llm-cost-observability\.test\.ts$/,
      /^netlify\/functions\/_lib\/observability(\.test)?\.ts$/,
      /^netlify\/functions\/_lib\/rag-context-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/rag-context\.ts$/,
      /^netlify\/functions\/_lib\/reindex-embeddings-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/extraction-log-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/ai-settings-boundary\.test\.ts$/,
      /^netlify\/functions\/ai-settings\.mts$/,
      /^netlify\/functions\/atlas\.mts$/,
      /^netlify\/functions\/cost-alert-check\.mts$/,
      /^netlify\/functions\/cronicas\.mts$/,
      /^netlify\/functions\/extract(-from-image)?\.mts$/,
      /^netlify\/functions\/extraction-log\.mts$/,
      /^netlify\/functions\/proactive-suggestions\.mts$/,
      /^netlify\/functions\/quote-(echoes|reflect)\.mts$/,
      /^netlify\/functions\/reclassify-entities\.mts$/,
      /^netlify\/functions\/reindex-embeddings\.mts$/,
      /^netlify\/functions\/spotify-(library-snapshot|suggest-artists)\.mts$/,
      /^netlify\/functions\/voz\.mts$/,
      /^netlify\/functions\/_lib\/voz-boundary\.test\.ts$/,
      /^netlify\/functions\/x-(classify|cronica)\.mts$/,
      /^netlify\/functions\/_lib\/x-(classify|cronica)-endpoint\.test\.ts$/,
    ],
  },
  {
    id: 'pr4-client-api-contracts',
    title: 'Correctness cliente y API contracts',
    patterns: [
      /^netlify\/functions\/_lib\/api-(error|success\.test)\.ts$/,
      /^netlify\/functions\/_lib\/catalog-types-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/momento-(embed\.test|schemas)\.ts$/,
      /^netlify\/functions\/_lib\/suggest-relationships-endpoint\.test\.ts$/,
      /^netlify\/functions\/(entity|relationship)-types\.mts$/,
      /^netlify\/functions\/suggest-relationships\.mts$/,
      /^src\/api\/(chat|momentos|request|transform)\.ts$/,
      /^src\/api\/request-boundary\.test\.ts$/,
      /^src\/api\/request\.test\.ts$/,
      /^src\/App(\.test)?\.tsx$/,
      /^src\/components\/(ApiAuthBridge|AuthGate|ErrorBoundary|UserMenu)(\.test)?\.tsx$/,
      /^src\/components\/ChatView(\.test)?\.tsx$/,
      /^src\/components\/CommandPalette(\.test)?\.tsx$/,
      /^src\/components\/EntitiesView\.test\.tsx$/,
      /^src\/components\/NodeDetailPanel\.test\.tsx$/,
      /^src\/components\/ProposalPanel\.test\.tsx$/,
      /^src\/components\/chat\/InlineProposal\.test\.tsx$/,
      /^src\/components\/quotes\/QuoteForm\.test\.tsx$/,
      /^src\/components\/settings\/(DataPanel|SearchPanel|XPanel)(\.test)?\.tsx$/,
      /^src\/main\.tsx$/,
      /^src\/state\/(queryClient|useAtlas|useChat|useCronicas|useCronologia|useEntities|useMomentos|useNotes|useQuotes|useRelationships|useTasks|useTwitter)(\.test)?\.tsx?$/,
      /^src\/types\/momento\.ts$/,
      /^src\/types\/relationship\.ts$/,
      /^docs\/conventions\/api\.md$/,
      /^tsconfig\.functions\.json$/,
    ],
  },
  {
    id: 'pr5-external-security',
    title: 'Seguridad y superficie externa',
    patterns: [
      /^netlify\.toml$/,
      /^netlify\/functions\/_lib\/db\.ts$/,
      /^netlify\/functions\/_lib\/deployment-guard\.test\.ts$/,
      /^netlify\/functions\/_lib\/momentos-file-endpoint\.test\.ts$/,
      /^netlify\/functions\/_lib\/momentos-url-preview-ssrf\.test\.ts$/,
      /^netlify\/functions\/momentos-url-preview\.mts$/,
      /^netlify\/functions\/spotify-timing\.mts$/,
      /^netlify\/functions\/wikipedia-search\.mts$/,
      /^package\.json$/,
      /^scripts\/check-legacy-fallback-prod\.mjs$/,
      /^scripts\/verify-pr-stack\.mjs$/,
    ],
  },
  {
    id: 'pr6-performance-scale',
    title: 'Performance y escala',
    patterns: [
      /^netlify\/functions\/_lib\/entities-lookup-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/graph-neighbors-boundary\.test\.ts$/,
      /^netlify\/functions\/_lib\/home-endpoint\.test\.ts$/,
      /^netlify\/functions\/entities-lookup\.mts$/,
      /^netlify\/functions\/graph-neighbors\.mts$/,
      /^netlify\/functions\/home\.mts$/,
      /^src\/api\/index\.ts$/,
      /^src\/api\/home\.ts$/,
      /^src\/components\/HomeView(\.test)?\.tsx$/,
      /^src\/components\/home\/FeaturedQuote\.tsx$/,
      /^src\/components\/GraphView(\.test)?\.tsx$/,
      /^src\/components\/RelationshipsView(\.test)?\.tsx$/,
      /^src\/components\/graph\/GraphCanvasSigma(\.test)?\.tsx$/,
      /^src\/components\/graph\/GraphSvgCanvas\.tsx$/,
      /^src\/components\/relationships\/RelationshipRow\.tsx$/,
      /^src\/hooks\/useGraphLayout(\.test)?\.tsx?$/,
      /^src\/hooks\/useMainScrollVirtualizer(\.test)?\.tsx?$/,
      /^src\/state\/useHome\.ts$/,
      /^src\/state\/index\.ts$/,
    ],
  },
  {
    id: 'pr7-docs-runbooks',
    title: 'Documentacion, env y runbooks',
    patterns: [
      /^\.env\.example$/,
      /^CLAUDE\.md$/,
      /^README\.md$/,
      /^docs\/(ai|arquitectura|deploy|escala|migracion-multi-user|migraciones|observability)\.md$/,
      /^docs\/conventions\/(data|dominios|llm|roadmap)\.md$/,
      /^docs\/saneamiento-integral-pr-stack\.md$/,
      /^netlify\/functions\/_lib\/isolation-guardrail\.test\.ts$/,
    ],
  },
  {
    id: 'pr8-ux-accessibility',
    title: 'UX/accesibilidad y deuda visual',
    patterns: [
      /^src\/components\/MobileBottomNav\.tsx$/,
      /^src\/components\/NumberTicker(\.test)?\.tsx$/,
      /^src\/components\/Onboarding(\.test)?\.tsx$/,
      /^src\/components\/Sidebar\.tsx$/,
      /^src\/components\/ToastHost(\.test)?\.tsx$/,
      /^src\/components\/TwitterView\.tsx$/,
      /^src\/components\/entities\/EntityForm(\.test)?\.tsx$/,
      /^src\/components\/momentos\/(AlbumGrid|AudioNote|AuthenticatedMedia|MomentoEntry|PhotoLightbox|RescueOrphansPanel)(\.test)?\.tsx$/,
      /^src\/components\/momentos\/helpers(\.test)?\.ts$/,
      /^src\/components\/momentos\/editModal\/FotoEditModal(\.test)?\.tsx$/,
      /^src\/components\/momentos\/editModal\/FotoPhotoTile(\.test)?\.tsx$/,
      /^src\/components\/momentos\/MergeMomentosBar(\.test)?\.tsx$/,
      /^src\/components\/notas\/(NotasView|NoteCard|TareasView)\.tsx$/,
      /^src\/components\/quotes\/ResonanceDots\.tsx$/,
      /^src\/components\/sidebar\/NavButton\.tsx$/,
      /^src\/index\.css$/,
      /^src\/state\/toast\.tsx$/,
    ],
  },
]

const ignored = [
  {
    reason:
      'auditorias locales de referencia; no forman parte del stack PR sin confirmacion explicita',
    patterns: [/^docs\/auditoria-(codex-)?2026-05-(30|31)\.md$/],
  },
]

function gitLines(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const changed = new Set([
  ...gitLines(['diff', '--cached', '--name-only']),
  ...gitLines(['diff', '--name-only']),
  ...gitLines(['ls-files', '--others', '--exclude-standard']),
])

function matches(patterns, file) {
  return patterns.some((pattern) => pattern.test(file))
}

const grouped = new Map(prStack.map((pr) => [pr.id, []]))
const ignoredFiles = []
const unclassified = []
const multiMatched = []

for (const file of [...changed].sort()) {
  const ignore = ignored.find((entry) => matches(entry.patterns, file))
  if (ignore) {
    ignoredFiles.push({ file, reason: ignore.reason })
    continue
  }

  const owners = prStack.filter((pr) => matches(pr.patterns, file))
  if (owners.length === 0) {
    unclassified.push(file)
    continue
  }
  if (owners.length > 1) {
    multiMatched.push({ file, owners: owners.map((pr) => pr.id) })
    continue
  }
  grouped.get(owners[0].id).push(file)
}

const args = process.argv.slice(2)
const filesIndex = args.indexOf('--files')
const requestedPrId = filesIndex >= 0 ? args[filesIndex + 1] : ''
const useNul = args.includes('--nul')
const listIds = args.includes('--list-ids')

function printClassificationErrors() {
  if (multiMatched.length > 0) {
    console.error('\nFiles matched more than one PR:')
    for (const item of multiMatched) {
      console.error(`  ${item.file}: ${item.owners.join(', ')}`)
    }
  }

  if (unclassified.length > 0) {
    console.error('\nUnclassified files:')
    for (const file of unclassified) console.error(`  ${file}`)
  }
}

if (listIds) {
  for (const pr of prStack) console.log(pr.id)
  process.exit(0)
}

if (multiMatched.length > 0 || unclassified.length > 0) {
  printClassificationErrors()
  process.exit(1)
}

if (requestedPrId) {
  const requested = grouped.get(requestedPrId)
  if (!requested) {
    console.error(`Unknown PR id: ${requestedPrId}`)
    process.exit(1)
  }
  process.stdout.write(requested.join(useNul ? '\0' : '\n'))
  if (!useNul && requested.length > 0) process.stdout.write('\n')
  process.exit(0)
}

for (const pr of prStack) {
  const files = grouped.get(pr.id)
  console.log(`\n${pr.id} — ${pr.title} (${files.length})`)
  for (const file of files) console.log(`  ${file}`)
}

if (ignoredFiles.length > 0) {
  console.log('\nignored')
  for (const { file, reason } of ignoredFiles) console.log(`  ${file} — ${reason}`)
}

console.log('\nPR stack verification ok')
