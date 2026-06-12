#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { STRUCTURE_RATCHETS } from './structure-ratchets.mjs'

export function fileLineCount(path, cwd = process.cwd()) {
  return readFileSync(resolve(cwd, path), 'utf8').split('\n').length
}

export function checkStructureRatchets({
  cwd = process.cwd(),
  ratchets = STRUCTURE_RATCHETS,
} = {}) {
  const failures = []
  const passes = []

  for (const ratchet of ratchets) {
    for (const file of ratchet.files) {
      const lineCount = fileLineCount(file, cwd)
      const entry = { file, group: ratchet.group, lineCount, maxLines: ratchet.maxLines }
      if (lineCount > ratchet.maxLines) failures.push(entry)
      else passes.push(entry)
    }
  }

  return { failures, passes }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCli) {
  const { failures, passes } = checkStructureRatchets()

  console.log('\nStructure ratchets:')
  console.log('-'.repeat(72))
  for (const entry of passes) {
    console.log(
      `  ${entry.file.padEnd(58)} ${String(entry.lineCount).padStart(4)}/${entry.maxLines}`,
    )
  }
  for (const entry of failures) {
    console.log(
      `  ${entry.file.padEnd(58)} ${String(entry.lineCount).padStart(4)}/${entry.maxLines}  FAIL ${entry.group}`,
    )
  }
  console.log('-'.repeat(72))

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} archivo(s) exceden su ratchet estructural. ` +
        'Extrae responsabilidades o sube el ratchet con justificación explícita.\n',
    )
    process.exit(1)
  }

  console.log('\nstructure ratchets ok\n')
}
