#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const BACKEND_DOMAIN_SERVICE_CONTRACTS = [
  {
    domain: 'recortes',
    endpoint: 'netlify/functions/_lib/recortes-endpoint.ts',
    service: 'netlify/functions/_lib/recortes-service.ts',
    endpointRequires: [
      'buildRecorteCreateDraft',
      'buildRecortePatchDraft',
      'buildRecorteSuggestionResponse',
      'recorteImageSourceKeys',
    ],
    serviceRequires: [
      'export function buildRecorteCreateDraft',
      'export function buildRecortePatchDraft',
      'export function buildRecorteSuggestionResponse',
      'export function recorteImageSourceKeys',
    ],
    endpointMaxLines: 645,
    serviceMaxLines: 140,
  },
  {
    domain: 'momentos',
    endpoint: 'netlify/functions/_lib/momentos-endpoint.ts',
    service: 'netlify/functions/_lib/momentos-service.ts',
    endpointRequires: [
      'buildMomentoCreateDraft',
      'buildMomentoPatchDraft',
      'ownerIdFromMomentoRow',
    ],
    serviceRequires: [
      'export function buildMomentoCreateDraft',
      'export function buildMomentoPatchDraft',
      'export function ownerIdFromMomentoRow',
    ],
    endpointMaxLines: 520,
    serviceMaxLines: 130,
  },
  {
    domain: 'search',
    endpoint: 'netlify/functions/_lib/search-endpoint.ts',
    service: 'netlify/functions/_lib/search-service.ts',
    endpointRequires: [
      'buildEmptySearchPayload',
      'buildSearchModePlan',
      'buildSearchResponse',
      'fuseSearchBranches',
      'fuseSingleSearchBranch',
    ],
    serviceRequires: [
      'export function buildEmptySearchPayload',
      'export function buildSearchModePlan',
      'export function buildSearchResponse',
      'export function fuseSearchBranches',
      'export function fuseSingleSearchBranch',
    ],
    endpointMaxLines: 335,
    serviceMaxLines: 220,
  },
  {
    domain: 'whatsapp',
    endpoint: 'netlify/functions/whatsapp-webhook.mts',
    service: 'netlify/functions/_lib/whatsapp/webhook-replies.ts',
    endpointRequires: [
      'buildCaptureReplyText',
      'helpMessage',
      'notLinkedMessage',
      'parseInlineTags',
      'welcomeMessage',
    ],
    serviceRequires: [
      'export function buildCaptureReplyText',
      'export function helpMessage',
      'export function notLinkedMessage',
      'export function parseInlineTags',
      'export function welcomeMessage',
    ],
    endpointMaxLines: 1480,
    serviceMaxLines: 120,
  },
]

function defaultReadFile(root, file) {
  const path = resolve(root, file)
  if (!existsSync(path)) {
    throw new Error(`missing file: ${file}`)
  }
  return readFileSync(path, 'utf8')
}

function lineCount(source) {
  return source.split('\n').length
}

function checkRequiredText(failures, file, source, required) {
  for (const marker of required) {
    if (!source.includes(marker)) {
      failures.push({
        file,
        message: `${file} debe contener "${marker}" para sostener el contrato de servicios de dominio backend.`,
      })
    }
  }
}

export function buildBackendDomainServicesInventory(options = {}) {
  const root = options.root ?? process.cwd()
  const contracts = options.contracts ?? BACKEND_DOMAIN_SERVICE_CONTRACTS
  const readFile =
    options.readFile ??
    ((file) => {
      try {
        return defaultReadFile(root, file)
      } catch {
        return null
      }
    })

  return {
    generatedBy: 'scripts/backend-domain-services.mjs',
    contracts: contracts.map((contract) => {
      const endpointSource = readFile(contract.endpoint)
      const serviceSource = readFile(contract.service)
      const endpointLines =
        typeof endpointSource === 'string' ? lineCount(endpointSource) : null
      const serviceLines =
        typeof serviceSource === 'string' ? lineCount(serviceSource) : null

      return {
        domain: contract.domain ?? null,
        endpoint: contract.endpoint,
        service: contract.service,
        endpointExists: typeof endpointSource === 'string',
        serviceExists: typeof serviceSource === 'string',
        endpointLines,
        serviceLines,
        endpointMaxLines: contract.endpointMaxLines ?? null,
        serviceMaxLines: contract.serviceMaxLines ?? null,
        ok:
          typeof endpointSource === 'string' &&
          typeof serviceSource === 'string' &&
          (contract.endpointRequires ?? []).every((marker) =>
            endpointSource.includes(marker),
          ) &&
          (contract.serviceRequires ?? []).every((marker) =>
            serviceSource.includes(marker),
          ) &&
          (!contract.endpointMaxLines || endpointLines <= contract.endpointMaxLines) &&
          (!contract.serviceMaxLines || serviceLines <= contract.serviceMaxLines),
      }
    }),
  }
}

export function checkBackendDomainServices(options = {}) {
  const inventory = buildBackendDomainServicesInventory(options)
  const root = options.root ?? process.cwd()
  const readFile =
    options.readFile ??
    ((file) => {
      try {
        return defaultReadFile(root, file)
      } catch {
        return null
      }
    })
  const failures = []
  const contracts = options.contracts ?? BACKEND_DOMAIN_SERVICE_CONTRACTS

  for (const contract of contracts) {
    const endpointSource = readFile(contract.endpoint)
    const serviceSource = readFile(contract.service)

    if (typeof endpointSource !== 'string') {
      failures.push({
        file: contract.endpoint,
        message: `${contract.endpoint} no existe; actualiza scripts/backend-domain-services.mjs si se movió el endpoint.`,
      })
      continue
    }
    if (typeof serviceSource !== 'string') {
      failures.push({
        file: contract.service,
        message: `${contract.service} no existe; crea el servicio o actualiza el contrato.`,
      })
      continue
    }

    checkRequiredText(
      failures,
      contract.endpoint,
      endpointSource,
      contract.endpointRequires ?? [],
    )
    checkRequiredText(
      failures,
      contract.service,
      serviceSource,
      contract.serviceRequires ?? [],
    )

    if (
      contract.endpointMaxLines &&
      lineCount(endpointSource) > contract.endpointMaxLines
    ) {
      failures.push({
        file: contract.endpoint,
        message: `${contract.endpoint} tiene ${lineCount(endpointSource)} líneas; límite de handler orquestador: ${contract.endpointMaxLines}.`,
      })
    }
    if (contract.serviceMaxLines && lineCount(serviceSource) > contract.serviceMaxLines) {
      failures.push({
        file: contract.service,
        message: `${contract.service} tiene ${lineCount(serviceSource)} líneas; divide el servicio antes de crecer más.`,
      })
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    contracts: inventory.contracts,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkBackendDomainServices()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }

  if (!result.ok) {
    console.error('Backend domain services contract failed:')
    for (const failure of result.failures) {
      console.error(`  - ${failure.message}`)
    }
    process.exit(1)
  }
  console.log('backend domain services ok')
}
