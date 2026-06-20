#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIRECT_FETCH_ALLOWLIST = [
  {
    file: 'src/api/request.ts',
    count: 1,
    reason: 'central API transport',
    requires: ['export async function requestBlob', 'return fetch(url,'],
  },
  {
    file: 'src/lib/libro/buildLibro.ts',
    count: 1,
    reason: 'external font asset',
  },
  {
    file: 'src/lib/pdfStudio/assemble/assembleFonts.ts',
    count: 1,
    reason: 'external font asset',
  },
  {
    file: 'src/components/recortes/RecorteCard.tsx',
    count: 1,
    reason: 'external imageUrl fallback only',
    requires: ['requestBlob(', 'fetch(r.imageUrl)'],
  },
  {
    file: 'src/components/momentos/AuthenticatedMedia.tsx',
    count: 1,
    reason: 'legacy single-user Momentos fallback only',
    requires: ['shouldRetryLegacyMediaWithoutAuth', 'headers: {}'],
  },
  {
    file: 'src/components/notas/pdfStudio/shell/usePdfStudioPageActions.ts',
    count: 1,
    reason: 'browser object-url bitmap export',
  },
]

const RAW_API_FETCH_ALLOWLIST = [
  {
    file: 'src/api/chat.ts',
    count: 1,
    reason: 'streaming chat response',
    requires: [
      'const response = await apiFetch(`/api/chat/threads/${threadId}/messages`',
      'response.body',
    ],
  },
  {
    file: 'src/lib/clientErrorTracking.ts',
    count: 1,
    reason: 'fire-and-forget client error telemetry',
    requires: ["void apiFetch('/api/error-log'", "method: 'POST'"],
  },
  {
    file: 'src/lib/webVitals.ts',
    count: 1,
    reason: 'fire-and-forget web vitals telemetry',
    requires: ["void apiFetch('/api/web-vitals'", "method: 'POST'"],
  },
]

const PRIVATE_BLOB_CONTRACTS = [
  {
    file: 'src/components/notas/AttachmentsPanel.tsx',
    requires: ['requestBlob(attachment.url)'],
    forbids: ['apiFetch(', 'fetch(attachment.url)'],
  },
  {
    file: 'src/components/notas/AttachmentPhotos.tsx',
    requires: ['requestBlob(photo.url)'],
    forbids: ['apiFetch(photo.url)', 'fetch(photo.url)'],
  },
  {
    file: 'src/components/momentos/AuthenticatedMedia.tsx',
    requires: ['requestBlob(src, { signal })'],
    forbids: ['apiFetch(src'],
  },
  {
    file: 'src/components/momentos/editModal/FotoEditModal.tsx',
    requires: ['requestBlob(momentoMediaUrl(item.storageKey))'],
    forbids: ['apiFetch(momentoMediaUrl'],
  },
  {
    file: 'src/components/recortes/RecorteCard.tsx',
    requires: ['requestBlob(recorteImageUrl(r.imageKey))'],
    forbids: ['apiFetch(recorteImageUrl'],
  },
  {
    file: 'src/lib/photoExport.ts',
    requires: ['requestBlob(url)'],
    forbids: ['apiFetch(url)', 'res.ok', 'res.blob()'],
  },
  {
    file: 'src/lib/pdfStudio/import/recortesToPdfFiles.ts',
    requires: [
      'fetchBlob: (url: string) => Promise<Blob>',
      'const blob = await fetchBlob',
    ],
    forbids: ['Promise<Response>', 'response.ok', 'response.blob()'],
  },
  {
    file: 'src/components/notas/NotasWorld.tsx',
    requires: ['fetchBlob: requestBlob'],
    forbids: ['fetcher: apiFetch'],
  },
]

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function isSourceFile(file) {
  if (!/\.(ts|tsx)$/.test(file)) return false
  if (/\.test\.(ts|tsx)$/.test(file)) return false
  return true
}

function countDirectFetches(source) {
  return source.match(/\bfetch\s*\(/g)?.length ?? 0
}

function countRawApiFetches(source) {
  return source.match(/\bapiFetch\s*\(/g)?.length ?? 0
}

function textChecks(contract, source) {
  const missingRequired = []
  const presentForbidden = []
  for (const required of contract.requires ?? []) {
    if (!source.includes(required)) missingRequired.push(required)
  }
  for (const forbidden of contract.forbids ?? []) {
    if (source.includes(forbidden)) presentForbidden.push(forbidden)
  }
  return { missingRequired, presentForbidden }
}

function pushMissingTextFailures(failures, contract, source) {
  const checks = textChecks(contract, source)
  for (const required of checks.missingRequired) {
    failures.push({
      file: contract.file,
      message: `${contract.file} debe contener "${required}" para sostener el contrato de blobs privados.`,
    })
  }
  for (const forbidden of checks.presentForbidden) {
    failures.push({
      file: contract.file,
      message: `${contract.file} no debe contener "${forbidden}"; usa requestBlob o inyección fetchBlob.`,
    })
  }
}

function allSourceFiles(projectRoot) {
  return walk(join(projectRoot, 'src')).filter(isSourceFile)
}

function sourceOrNull(projectRoot, file) {
  const path = join(projectRoot, file)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

export function buildClientApiInventory(root = process.cwd()) {
  const projectRoot = resolve(root)
  const allowByFile = new Map(DIRECT_FETCH_ALLOWLIST.map((entry) => [entry.file, entry]))
  const rawApiAllowByFile = new Map(
    RAW_API_FETCH_ALLOWLIST.map((entry) => [entry.file, entry]),
  )
  const directFetches = allSourceFiles(projectRoot)
    .map((file) => {
      const rel = relative(projectRoot, file)
      const source = readFileSync(file, 'utf8')
      const count = countDirectFetches(source)
      if (count === 0) return null
      const allowed = allowByFile.get(rel)
      return {
        file: rel,
        count,
        allowed: Boolean(allowed),
        reason: allowed?.reason ?? null,
        expectedCount: allowed?.count ?? null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file))

  const rawApiFetches = allSourceFiles(projectRoot)
    .filter((file) => relative(projectRoot, file) !== 'src/api/request.ts')
    .map((file) => {
      const rel = relative(projectRoot, file)
      const source = readFileSync(file, 'utf8')
      const count = countRawApiFetches(source)
      if (count === 0) return null
      const allowed = rawApiAllowByFile.get(rel)
      return {
        file: rel,
        count,
        allowed: Boolean(allowed),
        reason: allowed?.reason ?? null,
        expectedCount: allowed?.count ?? null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file))

  const privateBlobConsumers = PRIVATE_BLOB_CONTRACTS.map((contract) => {
    const source = sourceOrNull(projectRoot, contract.file)
    if (source === null) {
      return {
        file: contract.file,
        exists: false,
        ok: false,
        missingRequired: contract.requires ?? [],
        presentForbidden: [],
      }
    }
    const checks = textChecks(contract, source)
    return {
      file: contract.file,
      exists: true,
      ok: checks.missingRequired.length === 0 && checks.presentForbidden.length === 0,
      missingRequired: checks.missingRequired,
      presentForbidden: checks.presentForbidden,
    }
  }).sort((a, b) => a.file.localeCompare(b.file))

  const requestModule = sourceOrNull(projectRoot, 'src/api/request.ts') ?? ''
  const requestExports = {
    apiFetch: requestModule.includes('export async function apiFetch'),
    request: requestModule.includes('export async function request<'),
    requestResponse: requestModule.includes('export async function requestResponse'),
    requestBlob: requestModule.includes('export async function requestBlob'),
    apiClientError: requestModule.includes('export class ApiClientError'),
  }

  return {
    generatedBy: 'scripts/client-api-contracts.mjs',
    requestExports,
    directFetches,
    rawApiFetches,
    privateBlobConsumers,
    summary: {
      directFetchFiles: directFetches.length,
      allowedDirectFetchFiles: directFetches.filter((entry) => entry.allowed).length,
      rawApiFetchFiles: rawApiFetches.length,
      allowedRawApiFetchFiles: rawApiFetches.filter((entry) => entry.allowed).length,
      privateBlobConsumers: privateBlobConsumers.length,
      privateBlobConsumersOk: privateBlobConsumers.filter((entry) => entry.ok).length,
    },
  }
}

function inventoryFailures(inventory, root) {
  const projectRoot = resolve(root)
  const failures = []
  for (const entry of inventory.directFetches) {
    if (!entry.allowed) {
      failures.push({
        file: entry.file,
        message: `${entry.file} usa fetch() directo; agrega un helper en src/api/request.ts o justifica una excepción en scripts/client-api-contracts.mjs.`,
      })
      continue
    }
    if (entry.expectedCount !== entry.count) {
      failures.push({
        file: entry.file,
        message: `${entry.file} declara ${entry.expectedCount} fetch() directo(s) permitidos por "${entry.reason}", pero tiene ${entry.count}.`,
      })
    }
  }
  for (const contract of DIRECT_FETCH_ALLOWLIST) {
    const source = sourceOrNull(projectRoot, contract.file)
    if (source === null) continue
    pushMissingTextFailures(failures, contract, source)
  }
  for (const entry of inventory.rawApiFetches) {
    if (!entry.allowed) {
      failures.push({
        file: entry.file,
        message: `${entry.file} usa apiFetch() crudo; usa request(), requestResponse() o requestBlob(), o justifica una excepción en scripts/client-api-contracts.mjs.`,
      })
      continue
    }
    if (entry.expectedCount !== entry.count) {
      failures.push({
        file: entry.file,
        message: `${entry.file} declara ${entry.expectedCount} apiFetch() crudo(s) permitidos por "${entry.reason}", pero tiene ${entry.count}.`,
      })
    }
  }
  for (const contract of RAW_API_FETCH_ALLOWLIST) {
    const source = sourceOrNull(projectRoot, contract.file)
    if (source === null) continue
    pushMissingTextFailures(failures, contract, source)
  }
  for (const consumer of inventory.privateBlobConsumers) {
    if (!consumer.exists) {
      failures.push({
        file: consumer.file,
        message: `${consumer.file} no existe; actualiza scripts/client-api-contracts.mjs si se movió el consumidor.`,
      })
      continue
    }
    for (const required of consumer.missingRequired) {
      failures.push({
        file: consumer.file,
        message: `${consumer.file} debe contener "${required}" para sostener el contrato de blobs privados.`,
      })
    }
    for (const forbidden of consumer.presentForbidden) {
      failures.push({
        file: consumer.file,
        message: `${consumer.file} no debe contener "${forbidden}"; usa requestBlob o inyección fetchBlob.`,
      })
    }
  }
  return failures
}

export function checkClientApiContracts(root = process.cwd()) {
  const failures = inventoryFailures(buildClientApiInventory(root), root)
  return { ok: failures.length === 0, failures }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(buildClientApiInventory(), null, 2))
    process.exit(0)
  }

  const result = checkClientApiContracts()
  if (!result.ok) {
    console.error('Client API contract checks failed:')
    for (const failure of result.failures) console.error(`  - ${failure.message}`)
    process.exit(1)
  }
  console.log('client API contracts ok')
}
