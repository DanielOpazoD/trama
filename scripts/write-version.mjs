/**
 * Escribe `dist/version.json` con el commit que se está deployando.
 *
 * Es la mitad "emisora" del canario de deploy (`deploy-canary.mjs`): el
 * incidente de julio 2026 (deploy `locked` en Netlify) demostró que producción
 * puede quedar un mes clavada con TODO en verde, porque nada declara qué
 * commit está realmente servido. Este archivo lo declara, desde adentro del
 * artefacto publicado — si producción lo sirve, ese ES el commit en línea.
 *
 * Corre al final del build de Netlify (ver `netlify.toml`): `COMMIT_REF` es la
 * variable que Netlify inyecta con el sha del commit construido; fuera de
 * Netlify (build local) cae a `git rev-parse HEAD`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function buildVersionPayload({ sha, builtAt }) {
  return `${JSON.stringify({ sha, builtAt })}\n`
}

function resolveSha() {
  const fromNetlify = process.env.COMMIT_REF?.trim()
  if (fromNetlify) return fromNetlify
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function main() {
  if (!existsSync('dist')) {
    console.error('dist/ no existe — write-version corre DESPUÉS de `npm run build`.')
    process.exit(1)
  }
  const sha = resolveSha()
  writeFileSync(
    'dist/version.json',
    buildVersionPayload({ sha, builtAt: new Date().toISOString() }),
  )
  console.log(`dist/version.json → ${sha}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
