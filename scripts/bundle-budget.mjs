export function chunkBaseName(file) {
  const m = file.match(/^(.+)-[A-Za-z0-9_-]{6,12}\.js$/)
  return m ? m[1] : file.replace(/\.js$/, '')
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
