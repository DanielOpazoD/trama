#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const METRIC_AUDITS = {
  fcpMs: 'first-contentful-paint',
  lcpMs: 'largest-contentful-paint',
  tbtMs: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
}

function scoreToPercent(score) {
  return typeof score === 'number' ? Math.round(score * 100) : null
}

function auditNumeric(audits, id) {
  const value = audits?.[id]?.numericValue
  return typeof value === 'number' ? Math.round(value) : null
}

function listLargeAssets(audits, minBytes = 100 * 1024) {
  const items = audits?.['network-requests']?.details?.items
  if (!Array.isArray(items)) return []
  return items
    .map((item) => ({
      url: String(item.url ?? ''),
      transferKb: Math.round(Number(item.transferSize ?? 0) / 1024),
    }))
    .filter((item) => item.url && item.transferKb * 1024 >= minBytes)
    .sort((a, b) => b.transferKb - a.transferKb)
}

export function summarizeLighthouseReport(report) {
  const audits = report?.audits ?? {}
  const categories = report?.categories ?? {}
  const scores = Object.fromEntries(
    Object.entries(categories).map(([key, value]) => [key, scoreToPercent(value?.score)]),
  )
  const metrics = Object.fromEntries(
    Object.entries(METRIC_AUDITS).map(([key, auditId]) => [
      key,
      auditNumeric(audits, auditId),
    ]),
  )
  const diagnostics = audits?.diagnostics?.details?.items?.[0] ?? {}

  return {
    url: report?.finalDisplayedUrl ?? report?.requestedUrl ?? null,
    lighthouseVersion: report?.lighthouseVersion ?? null,
    scores,
    metrics,
    requestCount:
      typeof diagnostics.numRequests === 'number' ? diagnostics.numRequests : null,
    totalByteWeightKb:
      typeof diagnostics.totalByteWeight === 'number'
        ? Math.round(diagnostics.totalByteWeight / 1024)
        : null,
    largeAssets: listLargeAssets(audits),
  }
}

function printSummary(summary) {
  console.log(`Lighthouse summary: ${summary.url ?? 'unknown URL'}`)
  if (summary.lighthouseVersion) {
    console.log(`Version: ${summary.lighthouseVersion}`)
  }
  console.log('Scores:')
  for (const [name, score] of Object.entries(summary.scores)) {
    console.log(`  - ${name}: ${score ?? 'n/a'}`)
  }
  console.log('Metrics:')
  console.log(`  - FCP: ${summary.metrics.fcpMs ?? 'n/a'} ms`)
  console.log(`  - LCP: ${summary.metrics.lcpMs ?? 'n/a'} ms`)
  console.log(`  - TBT: ${summary.metrics.tbtMs ?? 'n/a'} ms`)
  console.log(`  - CLS: ${summary.metrics.cls ?? 'n/a'}`)
  if (summary.requestCount !== null || summary.totalByteWeightKb !== null) {
    console.log(
      `Network: ${summary.requestCount ?? 'n/a'} requests, ${summary.totalByteWeightKb ?? 'n/a'} KiB`,
    )
  }
  if (summary.largeAssets.length > 0) {
    console.log('Large assets:')
    for (const asset of summary.largeAssets.slice(0, 10)) {
      console.log(`  - ${asset.transferKb} KiB ${asset.url}`)
    }
  }
}

function main(argv = process.argv.slice(2)) {
  const [file] = argv
  if (!file) {
    console.error('Usage: npm run lighthouse:summary -- <lighthouse-report.json>')
    process.exitCode = 1
    return
  }
  const report = JSON.parse(readFileSync(file, 'utf8'))
  printSummary(summarizeLighthouseReport(report))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
