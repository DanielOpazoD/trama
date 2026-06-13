export function chunkBaseName(file, knownBases = []) {
  const withoutExtension = file.replace(/\.js$/, '')
  const known = [...knownBases].sort((a, b) => b.length - a.length)
  for (const base of known) {
    if (!withoutExtension.startsWith(`${base}-`)) continue
    const suffix = withoutExtension.slice(base.length + 1)
    if (/^[A-Za-z0-9_-]{6,12}$/.test(suffix)) return base
  }

  const m = file.match(/^(.+)-[A-Za-z0-9_-]{6,12}\.js$/)
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
