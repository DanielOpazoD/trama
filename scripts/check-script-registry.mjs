#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  QUALITY_GATES,
  SCRIPT_DOMAINS,
  SCRIPT_KINDS,
  SCRIPT_REGISTRY,
} from './script-registry.mjs'

const SCRIPT_EXTENSIONS = new Set(['.mjs', '.sh', '.sql', '.ts'])
const TEST_FILE_RE = /(?:^|\/).+\.test\.(?:mjs|ts)$/
const SCRIPT_REF_RE = /(?:^|[\s('"=])(?:node|bash|sh)?\s*(scripts\/[^\s'"|&;)]+)/
const WORKFLOW_COMMAND_RE =
  /\b(?:npm run [A-Za-z0-9:_-]+|npm test|node scripts\/[^\s'"|&;)]+|bash scripts\/[^\s'"|&;)]+|scripts\/[^\s'"|&;)]+\.sh)\b/g
const PATH_TO_FILE_URL_ARGV_RE = /pathToFileURL\(process\.argv\[1\]\)/g
const PATH_TO_FILE_URL_ARGV_LINE_RE = /pathToFileURL\(process\.argv\[1\]\)/

function normalizePath(path) {
  return path.replaceAll('\\', '/')
}

function walkFiles(root, dir = root) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...walkFiles(root, fullPath))
      continue
    }
    files.push(normalizePath(relative(root, fullPath)))
  }
  return files
}

function isOperationalScriptFile(file) {
  if (!file.startsWith('scripts/')) return false
  if (TEST_FILE_RE.test(file)) return false
  const ext = file.slice(file.lastIndexOf('.'))
  return SCRIPT_EXTENSIONS.has(ext)
}

function listOperationalScriptFiles(root) {
  const scriptsDir = join(root, 'scripts')
  if (!existsSync(scriptsDir)) return []
  return walkFiles(root, scriptsDir).filter(isOperationalScriptFile).sort()
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collectPackageScriptRefs(root) {
  const packagePath = join(root, 'package.json')
  if (!existsSync(packagePath)) return []
  const scripts = readJson(packagePath).scripts ?? {}
  const refs = []
  for (const [command, value] of Object.entries(scripts)) {
    const matches = [...String(value).matchAll(new RegExp(SCRIPT_REF_RE, 'g'))]
    for (const match of matches) {
      refs.push({
        command,
        file: normalizePath(match[1]),
      })
    }
  }
  return refs
}

function collectPackageScriptNames(root) {
  const packagePath = join(root, 'package.json')
  if (!existsSync(packagePath)) return new Set()
  return new Set(Object.keys(readJson(packagePath).scripts ?? {}))
}

function normalizeWorkflowCommand(command) {
  if (command.startsWith('bash ')) return command.slice('bash '.length)
  return command
}

function collectWorkflowCommands(root) {
  const workflowDir = join(root, '.github/workflows')
  if (!existsSync(workflowDir)) return []
  const commands = []
  for (const file of readdirSync(workflowDir).filter((entry) => /\.ya?ml$/.test(entry))) {
    const workflowPath = join(workflowDir, file)
    const contents = readFileSync(workflowPath, 'utf8')
    for (const match of contents.matchAll(WORKFLOW_COMMAND_RE)) {
      commands.push({
        command: normalizeWorkflowCommand(match[0]),
        file: normalizePath(relative(root, workflowPath)),
      })
    }
  }
  return [
    ...new Map(
      commands.map((entry) => [`${entry.file}:${entry.command}`, entry]),
    ).values(),
  ]
}

function commandToScriptFile(command, packageScriptRefs) {
  if (command.startsWith('npm run ')) {
    const npmScript = command.slice('npm run '.length)
    return packageScriptRefs.find((ref) => ref.command === npmScript)?.file ?? null
  }
  if (command === 'npm test') {
    return packageScriptRefs.find((ref) => ref.command === 'test')?.file ?? null
  }
  if (command.startsWith('node ')) return normalizePath(command.slice('node '.length))
  if (command.startsWith('scripts/')) return normalizePath(command)
  return null
}

function uniqueBy(items, keyFn) {
  return [...new Map(items.map((item) => [keyFn(item), item])).values()]
}

export function findScriptRegistryIssues(
  root = process.cwd(),
  { registry = SCRIPT_REGISTRY, qualityGates = QUALITY_GATES } = {},
) {
  const issues = []
  const scriptFiles = listOperationalScriptFiles(root)
  const registryByFile = new Map()
  const packageScriptNames = collectPackageScriptNames(root)
  const packageScriptRefs = collectPackageScriptRefs(root)
  const qualityGateCommands = new Set(qualityGates.map((gate) => gate.command))

  for (const entry of registry) {
    if (registryByFile.has(entry.file)) {
      issues.push({
        code: 'registry-duplicate',
        file: entry.file,
        message: 'Script appears more than once in SCRIPT_REGISTRY.',
      })
    }
    registryByFile.set(entry.file, entry)

    if (!SCRIPT_DOMAINS.includes(entry.domain)) {
      issues.push({
        code: 'registry-invalid-domain',
        file: entry.file,
        message: 'Registry entry uses an unknown domain.',
      })
    }
    if (!SCRIPT_KINDS.includes(entry.kind)) {
      issues.push({
        code: 'registry-invalid-kind',
        file: entry.file,
        message: 'Registry entry uses an unknown kind.',
      })
    }
    if (typeof entry.summary !== 'string' || entry.summary.trim().length < 12) {
      issues.push({
        code: 'registry-missing-summary',
        file: entry.file,
        message: 'Registry entry needs a concrete summary.',
      })
    }
    if (!Array.isArray(entry.packageScripts)) {
      issues.push({
        code: 'registry-missing-package-scripts',
        file: entry.file,
        message: 'Registry entry must declare packageScripts, even when empty.',
      })
    } else {
      for (const command of entry.packageScripts) {
        if (packageScriptNames.has(command)) continue
        issues.push({
          code: 'registry-package-command-missing',
          command,
          file: entry.file,
          message: 'Registry entry links to a package.json command that does not exist.',
        })
      }
    }
    if (!existsSync(join(root, entry.file))) {
      issues.push({
        code: 'registry-path-missing',
        file: entry.file,
        message: 'Registry entry points to a missing file.',
      })
    }
  }

  for (const file of scriptFiles) {
    if (registryByFile.has(file)) continue
    issues.push({
      code: 'script-unregistered',
      file,
      message: 'Operational script is not listed in SCRIPT_REGISTRY.',
    })
  }

  for (const { command, file } of packageScriptRefs) {
    const entry = registryByFile.get(file)
    if (!entry) {
      issues.push({
        code: 'package-command-unregistered-script',
        command,
        file,
        message:
          'package.json command invokes a script file missing from SCRIPT_REGISTRY.',
      })
      continue
    }
    if (!entry.packageScripts?.includes(command)) {
      issues.push({
        code: 'package-command-undocumented',
        command,
        file,
        message:
          'package.json command invokes a script file not linked from its registry entry.',
      })
    }
  }

  for (const { command, file } of collectWorkflowCommands(root)) {
    if (!qualityGateCommands.has(command)) {
      issues.push({
        code: 'workflow-gate-undocumented',
        command,
        file,
        message: 'Workflow command is not listed in QUALITY_GATES.',
      })
    }
    const scriptFile = commandToScriptFile(command, packageScriptRefs)
    if (scriptFile && !registryByFile.has(scriptFile)) {
      issues.push({
        code: 'workflow-gate-unregistered-script',
        command,
        file: scriptFile,
        message: 'Workflow command points to a script missing from SCRIPT_REGISTRY.',
      })
    }
  }

  for (const gate of qualityGates) {
    if (typeof gate.summary !== 'string' || gate.summary.trim().length < 12) {
      issues.push({
        code: 'quality-gate-missing-summary',
        command: gate.command,
        message: 'Quality gate needs a concrete summary.',
      })
    }
    if (!gate.job || !gate.phase) {
      issues.push({
        code: 'quality-gate-missing-metadata',
        command: gate.command,
        message: 'Quality gate must declare job and phase.',
      })
    }
  }

  return uniqueBy(issues, (issue) =>
    [issue.code, issue.command ?? '', issue.file ?? '', issue.line ?? ''].join(':'),
  )
}

function lineNumberForIndex(contents, index) {
  return contents.slice(0, index).split('\n').length
}

function hasArgvGuard(line) {
  const useIndex = line.search(PATH_TO_FILE_URL_ARGV_LINE_RE)
  if (useIndex < 0) return true
  return line.slice(0, useIndex).includes('process.argv[1] &&')
}

export function findUnsafeCliEntrypointIssues(root = process.cwd()) {
  const issues = []
  for (const file of listOperationalScriptFiles(root).filter((entry) =>
    entry.endsWith('.mjs'),
  )) {
    const contents = readFileSync(join(root, file), 'utf8')
    PATH_TO_FILE_URL_ARGV_RE.lastIndex = 0
    let match = PATH_TO_FILE_URL_ARGV_RE.exec(contents)
    while (match) {
      const index = match.index
      const lineStart = contents.lastIndexOf('\n', index) + 1
      const lineEnd = contents.indexOf('\n', index)
      const line = contents.slice(lineStart, lineEnd === -1 ? contents.length : lineEnd)
      if (!hasArgvGuard(line)) {
        issues.push({
          code: 'unguarded-path-to-file-url',
          file,
          line: lineNumberForIndex(contents, index),
          message: 'Guard process.argv[1] before passing it to pathToFileURL().',
        })
      }
      match = PATH_TO_FILE_URL_ARGV_RE.exec(contents)
    }
  }
  return issues
}

export function formatScriptRegistryIssues(issues) {
  return issues
    .map((issue) => {
      const location = [issue.file, issue.line ? `:${issue.line}` : ''].join('')
      const command = issue.command ? ` (${issue.command})` : ''
      return `- ${issue.code}: ${location}${command}. ${issue.message}`
    })
    .join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issues = [
    ...findScriptRegistryIssues(process.cwd()),
    ...findUnsafeCliEntrypointIssues(process.cwd()),
  ]
  if (issues.length > 0) {
    console.error(
      `Script registry contract failed:\n${formatScriptRegistryIssues(issues)}`,
    )
    process.exit(1)
  }
  console.log('Script registry contract OK.')
}
