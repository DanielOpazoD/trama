export function chunkBaseName(file, knownBases = []) {
  const withoutExtension = file.replace(/\.(?:js|mjs)$/, '')
  const known = [...knownBases].sort((a, b) => b.length - a.length)
  for (const base of known) {
    if (!withoutExtension.startsWith(`${base}-`)) continue
    const suffix = withoutExtension.slice(base.length + 1)
    if (/^[A-Za-z0-9_-]{6,12}$/.test(suffix)) return base
  }

  const m = file.match(/^(.+?)-[A-Za-z0-9_-]{6,12}\.(?:js|mjs)$/)
  const base = m ? m[1] : withoutExtension
  return base.replace(/-(?:t|tsx|jsx)$/, '')
}

export function classifyBundleEntry({ base, budget, gzKb, maxUnbudgetedKb }) {
  if (budget === undefined) {
    if (gzKb > maxUnbudgetedKb) {
      return { file: base, gzKb, budget: maxUnbudgetedKb, status: 'missing-budget' }
    }
    return { file: base, gzKb, status: 'no-budget' }
  }

  if (gzKb > budget) {
    return { file: base, gzKb, budget, status: 'over-budget' }
  }

  return { file: base, gzKb, budget, status: 'ok' }
}

export function summarizeBundleEntries(entries, familyBudgets = []) {
  const byFile = new Map()
  for (const entry of entries) {
    const current = byFile.get(entry.file) ?? { file: entry.file, count: 0, gzKb: 0 }
    current.count += 1
    current.gzKb += entry.gzKb
    byFile.set(entry.file, current)
  }

  const duplicates = [...byFile.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.gzKb - a.gzKb || a.file.localeCompare(b.file))

  const families = familyBudgets.map((family) => {
    const bases = new Set(family.bases)
    const familyEntries = entries.filter((entry) => bases.has(entry.file))
    const byFamilyFile = new Map()
    for (const entry of familyEntries) {
      byFamilyFile.set(entry.file, (byFamilyFile.get(entry.file) ?? 0) + entry.gzKb)
    }
    const allOffenders = [...byFamilyFile.entries()]
      .map(([file, gzKb]) => ({ file, gzKb }))
      .sort((a, b) => b.gzKb - a.gzKb || a.file.localeCompare(b.file))
    const gzKb = allOffenders.reduce((sum, entry) => sum + entry.gzKb, 0)
    return {
      name: family.name,
      gzKb,
      budget: family.budget,
      status: gzKb > family.budget ? 'over-budget' : 'ok',
      offenders: allOffenders.slice(0, 6),
    }
  })

  return { duplicates, families }
}

export function evaluateDuplicateBudgets(duplicates, duplicateBudgets = {}) {
  const failures = []
  for (const duplicate of duplicates) {
    const budget = duplicateBudgets[duplicate.file]
    if (!budget) continue
    if (duplicate.count <= budget.maxCount && duplicate.gzKb <= budget.maxGzKb) continue
    const exceeded = []
    if (duplicate.count > budget.maxCount) exceeded.push('count')
    if (duplicate.gzKb > budget.maxGzKb) exceeded.push('gzKb')
    failures.push({
      file: duplicate.file,
      count: duplicate.count,
      gzKb: duplicate.gzKb,
      maxCount: budget.maxCount,
      maxGzKb: budget.maxGzKb,
      exceeded,
      status: 'duplicate-over-budget',
    })
  }
  return failures
}
