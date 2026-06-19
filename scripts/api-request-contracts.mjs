#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const API_REQUEST_CONTRACTS = [
  {
    domain: 'search',
    file: 'netlify/functions/_lib/search-endpoint.ts',
    requires: ['parseSearchParams(req, SearchQueryParams, requestId)', 'requireMethod('],
    forbids: ['searchParams.get('],
    reason:
      'cross-domain private retrieval should validate query params before SQL/LLM work',
  },
  {
    domain: 'notes',
    file: 'netlify/functions/notes.mts',
    requires: ['parseSearchParams(req, NoteListQuery, requestId)', 'parseJsonBody('],
    forbids: ["searchParams.get('q')", "searchParams.get('tag')"],
    reason: 'Notas list/search is the busiest private writing surface',
  },
  {
    domain: 'recortes',
    file: 'netlify/functions/_lib/recortes-endpoint.ts',
    requires: ['parseSearchParams(req, RecortesListQuery, requestId)', 'parseJsonBody('],
    forbids: ["searchParams.get('status')"],
    reason: 'capture inbox filters should stay compatible but explicit',
  },
  {
    domain: 'momentos',
    file: 'netlify/functions/_lib/momentos-endpoint.ts',
    requires: ['parseSearchParams(req, MomentosListQuery, requestId)'],
    forbids: ['parseMomentosListParams(url)', 'new URL(req.url)'],
    reason: 'timeline pagination is private and should reject ambiguous cursors early',
  },
  {
    domain: 'notas-attachments',
    file: 'netlify/functions/notas-attachments.mts',
    requires: ['parseSearchParams(req, AttachmentOwnerQuery, requestId)'],
    forbids: ["searchParams.get('ownerType')", "searchParams.get('ownerId')"],
    reason: 'attachment metadata must validate owner query before ownership lookup',
  },
  {
    domain: 'notas-attachments-upload',
    file: 'netlify/functions/notas-attachments-upload.mts',
    requires: [
      'requireMethod(req, requestId, [',
      'readFormData(req, requestId)',
      'parseFormFields(formData, AttachmentUploadFields, requestId)',
    ],
    forbids: ['await req.formData()', "headers.get('content-type')"],
    reason: 'blob-backed uploads need canonical method/form errors before storage writes',
  },
]

function read(root, file) {
  return readFileSync(join(root, file), 'utf8')
}

export function validateApiRequestContracts({
  root = process.cwd(),
  contracts = API_REQUEST_CONTRACTS,
} = {}) {
  const issues = []

  for (const contract of contracts) {
    const source = read(root, contract.file)
    for (const required of contract.requires) {
      if (!source.includes(required)) {
        issues.push({
          domain: contract.domain,
          file: contract.file,
          message: `missing required request contract marker: ${required}`,
        })
      }
    }
    for (const forbidden of contract.forbids) {
      if (source.includes(forbidden)) {
        issues.push({
          domain: contract.domain,
          file: contract.file,
          message: `manual request parsing is not allowed here: ${forbidden}`,
        })
      }
    }
    if (!contract.reason || contract.reason.length < 30) {
      issues.push({
        domain: contract.domain,
        file: contract.file,
        message: 'contract reason must explain the private API risk',
      })
    }
  }

  return {
    ok: issues.length === 0,
    contracts,
    issues,
  }
}

export function formatApiRequestContractReport(result) {
  const lines = ['api_request_contracts: ' + (result.ok ? 'ok' : 'failed'), '']
  lines.push(`contracted_surfaces: ${result.contracts.length}`)
  for (const contract of result.contracts) {
    lines.push(`- ${contract.domain}: ${contract.file}`)
  }
  if (result.issues.length > 0) {
    lines.push('', 'issues:')
    for (const issue of result.issues) {
      lines.push(`- ${issue.domain} (${issue.file}): ${issue.message}`)
    }
  }
  return lines.join('\n')
}

function main() {
  const json = process.argv.includes('--json')
  const result = validateApiRequestContracts()
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stdout.write(formatApiRequestContractReport(result) + '\n')
  }
  if (!result.ok) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
