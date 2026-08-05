/**
 * Canario de deploy: ¿producción sirve lo que hay en `origin/main`?
 *
 * **Por qué existe.** En julio 2026 producción quedó UN MES clavada en un
 * commit viejo: el deploy figuraba `ready`, CI en verde, Netlify construía
 * cada merge… y un `locked: true` silencioso impedía publicar. Ningún check
 * miraba lo único que importa: qué commit está realmente en línea.
 *
 * **Cómo funciona.** El build publica `dist/version.json` con su sha
 * (`write-version.mjs`, servido con `no-store`). Esta sonda lo baja de
 * `tramahub.app`, lo compara con `origin/main` y decide:
 *
 *   ok          → producción sirve exactamente origin/main.
 *   esperando   → hay diferencia pero main es reciente (< GRACE_MS): el
 *                 deploy probablemente está en vuelo. Sin alarma.
 *   desfase     → producción sirve un commit viejo de main y la gracia venció.
 *                 ALARMA — la clase exacta del incidente de julio.
 *   sin-version → producción no sirve un version.json válido pasada la
 *                 gracia: o este pack nunca llegó a publicarse, o el build
 *                 dejó de emitirlo. ALARMA (el primer run en verde de este
 *                 verdict ES la prueba de que el canario quedó vivo).
 *   desconocido → producción sirve un sha que NO pertenece a main (rollback
 *                 manual, branch deploy). ALARMA inmediata, sin gracia: el
 *                 tiempo no lo va a arreglar.
 *
 * Sin secretos ni API de Netlify: mide conducta observable (lo que el CDN
 * sirve), que es la única prueba que el incidente validó como fiable.
 * Corre programado en `.github/workflows/deploy-canary.yml`; en desfase el
 * workflow falla y abre un issue etiquetado `deploy-canary`.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const PROD_VERSION_URL = 'https://tramahub.app/version.json'

/** Gracia para un deploy en vuelo: build de Netlify + CDN tardan minutos,
 *  no una hora. Vencida la gracia, la diferencia deja de ser inocente. */
export const GRACE_MS = 45 * 60 * 1000

/**
 * Decisión pura del canario. `prod` es el resultado de la sonda HTTP
 * ({ ok, sha }); `prodShaEnMain` dice si ese sha pertenece a la historia de
 * origin/main (null cuando no hay sha que consultar).
 */
export function evaluateDeploy({ prod, mainSha, mainCommitMs, nowMs, prodShaEnMain }) {
  const graceActive = nowMs - mainCommitMs < GRACE_MS
  if (!prod.ok || !prod.sha) {
    if (graceActive) {
      return {
        verdict: 'esperando',
        alarm: false,
        reason: 'sin version.json aún, pero main es reciente: deploy en vuelo.',
      }
    }
    return {
      verdict: 'sin-version',
      alarm: true,
      reason:
        'producción no sirve un version.json válido pasada la gracia — el build no lo emite o el deploy nunca publicó.',
    }
  }
  if (prod.sha === mainSha) {
    return {
      verdict: 'ok',
      alarm: false,
      reason: `producción sirve origin/main (${mainSha.slice(0, 8)}).`,
    }
  }
  if (prodShaEnMain === false) {
    return {
      verdict: 'desconocido',
      alarm: true,
      reason: `producción sirve ${prod.sha.slice(0, 8)}, que NO pertenece a origin/main — ¿rollback manual o branch deploy?`,
    }
  }
  if (graceActive) {
    return {
      verdict: 'esperando',
      alarm: false,
      reason: `producción sirve ${prod.sha.slice(0, 8)} y main (${mainSha.slice(0, 8)}) es reciente: deploy en vuelo.`,
    }
  }
  return {
    verdict: 'desfase',
    alarm: true,
    reason: `producción sirve ${prod.sha.slice(0, 8)} pero origin/main es ${mainSha.slice(0, 8)} desde hace más de ${Math.round(GRACE_MS / 60000)} min — el deploy no está publicando.`,
  }
}

const SHA_RE = /^[0-9a-f]{7,40}$/i

export async function fetchProdVersion(url = PROD_VERSION_URL) {
  try {
    // Cache-buster + no-cache: la respuesta ya viaja con `no-store` desde
    // netlify.toml, pero un canario que pueda leer caché no prueba nada.
    const res = await fetch(`${url}?canary=${Date.now()}`, {
      headers: { 'cache-control': 'no-cache' },
    })
    if (!res.ok) return { ok: false, sha: null, status: res.status }
    const body = await res.json()
    const sha = typeof body?.sha === 'string' && SHA_RE.test(body.sha) ? body.sha : null
    return { ok: sha !== null, sha, status: res.status }
  } catch {
    return { ok: false, sha: null, status: 0 }
  }
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function isAncestorOfMain(sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'])
    return true
  } catch {
    return false
  }
}

async function main() {
  const prod = await fetchProdVersion()
  const mainSha = git('rev-parse', 'origin/main')
  const mainCommitMs = Number(git('show', '-s', '--format=%ct', 'origin/main')) * 1000
  const result = evaluateDeploy({
    prod,
    mainSha,
    mainCommitMs,
    nowMs: Date.now(),
    prodShaEnMain: prod.sha ? isAncestorOfMain(prod.sha) : null,
  })
  console.log(`canario: ${result.verdict} — ${result.reason}`)
  if (result.alarm) {
    console.error('::error::' + result.reason)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
