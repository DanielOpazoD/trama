#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { QUALITY_GATE_BASELINE } from './quality-gates-baseline.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'))
}

const KNIP_IGNORE_ISSUE_DOMAINS = [
  {
    name: 'pdf-studio-contracts',
    matches: (file) => file.includes('/pdfStudio/'),
  },
  {
    name: 'api-contracts',
    matches: (file) => file.startsWith('src/api/'),
  },
  {
    name: 'component-contracts',
    matches: (file) => file.startsWith('src/components/'),
  },
  {
    name: 'shared-lib-contracts',
    matches: (file) => file.startsWith('src/lib/'),
  },
  {
    name: 'state-contracts',
    matches: (file) => file.startsWith('src/state/'),
  },
  {
    name: 'shared-domain-types',
    matches: (file) => file.startsWith('src/types/'),
  },
]

function classifyIgnoreIssueDomains(ignoreIssues) {
  const classified = new Set()
  return KNIP_IGNORE_ISSUE_DOMAINS.map((domain) => {
    const entries = Object.entries(ignoreIssues).filter(([file]) => {
      if (classified.has(file) || !domain.matches(file)) return false
      classified.add(file)
      return true
    })
    return {
      name: domain.name,
      files: entries.length,
      kinds: entries.reduce((total, [, issues]) => total + issues.length, 0),
    }
  }).filter((domain) => domain.files > 0 || domain.kinds > 0)
}

export function buildQualityGatesReport() {
  const knip = readJson('knip.json')
  const architectureBaseline = readJson('.dependency-cruiser-known-violations.json')
  const packageJson = readJson('package.json')
  const ignoreIssues = knip.ignoreIssues ?? {}
  const ignoredIssueFiles = Object.keys(ignoreIssues).length
  const ignoredIssueKinds = Object.values(ignoreIssues).reduce(
    (total, issues) => total + issues.length,
    0,
  )

  return {
    knip: {
      ignoreIssueFiles: ignoredIssueFiles,
      ignoreIssueKinds: ignoredIssueKinds,
      ignoreFiles: knip.ignoreFiles?.length ?? 0,
      ignoreDependencies: knip.ignoreDependencies?.length ?? 0,
      ignoreBinaries: knip.ignoreBinaries?.length ?? 0,
      ignoreIssueDomains: classifyIgnoreIssueDomains(ignoreIssues),
      baseline: QUALITY_GATE_BASELINE.knip,
    },
    dependencyCruiser: {
      knownViolations: architectureBaseline.knownViolations?.length ?? 0,
      baseline: QUALITY_GATE_BASELINE.dependencyCruiser,
    },
    scripts: {
      checkKnip: packageJson.scripts['check:knip'],
      checkDeadCode: packageJson.scripts['check:dead-code'],
      checkArchitecture: packageJson.scripts['check:architecture'],
      checkDependencyCruiser: packageJson.scripts['check:dependency-cruiser'],
    },
  }
}

function formatCount(label, actual, expected) {
  return `  - ${label}: ${actual}/${expected}`
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatQualityGatesReport(report) {
  return [
    'Quality gates evidence',
    '',
    'Knip baseline:',
    formatCount(
      'ignoreIssues files',
      report.knip.ignoreIssueFiles,
      report.knip.baseline.ignoreIssueFiles,
    ),
    formatCount(
      'ignoreIssues kinds',
      report.knip.ignoreIssueKinds,
      report.knip.baseline.ignoreIssueKinds,
    ),
    formatCount('ignoreFiles', report.knip.ignoreFiles, report.knip.baseline.ignoreFiles),
    formatCount(
      'ignoreDependencies',
      report.knip.ignoreDependencies,
      report.knip.baseline.ignoreDependencies,
    ),
    formatCount(
      'ignoreBinaries',
      report.knip.ignoreBinaries,
      report.knip.baseline.ignoreBinaries,
    ),
    '',
    'Knip ignoreIssue domains:',
    ...report.knip.ignoreIssueDomains.map(
      (domain) =>
        `  - ${domain.name}: ${pluralize(domain.files, 'file')}, ${pluralize(
          domain.kinds,
          'kind',
        )}`,
    ),
    '',
    'Dependency-cruiser baseline:',
    formatCount(
      'known violations',
      report.dependencyCruiser.knownViolations,
      report.dependencyCruiser.baseline.knownViolations,
    ),
    '',
    'Commands:',
    `  - check:knip: ${report.scripts.checkKnip}`,
    `  - check:dead-code: ${report.scripts.checkDeadCode}`,
    `  - check:architecture: ${report.scripts.checkArchitecture}`,
    `  - check:dependency-cruiser: ${report.scripts.checkDependencyCruiser}`,
  ].join('\n')
}

export function main() {
  console.log(formatQualityGatesReport(buildQualityGatesReport()))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
