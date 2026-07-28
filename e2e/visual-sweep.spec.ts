import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'
import { findOcclusions, findUnreachable } from './visualContract'

/**
 * Barrido del contrato visual sobre TODA la aplicación, en modo informe.
 *
 * El gate de `occlusion.spec.ts` bloquea el CI, pero sólo mira 5 superficies de
 * 19 y un tema de 3 — un 9% de la matriz. En ese 9% encontró tres defectos
 * reales, así que la pregunta abierta es qué hay en el 91% restante. Este spec
 * la responde: recorre las 11 vistas del mundo Trama, las 8 secciones del mundo
 * Notas y los tres temas, y **reporta sin fallar**.
 *
 * Es deliberadamente un informe y no un gate. Convertirlo en bloqueante de
 * golpe significaría o bien romper el CI hasta arreglarlo todo, o bien meter
 * excepciones para tapar lo que salga — las dos cosas malas. El camino es al
 * revés: leer lo que devuelve, arreglar por packs, y **promover cada superficie
 * al gate de `occlusion.spec.ts` cuando esté limpia**.
 *
 * Opt-in con `VISUAL_SWEEP=1`, igual que `PDF_STUDIO_VISUAL`: no tiene sentido
 * pagar el barrido en cada PR, y un test que nunca falla sólo añadiría ruido.
 *
 *   npm run e2e:visual-sweep
 */

const ENABLED = process.env.VISUAL_SWEEP === '1'

/** Las 11 vistas del mundo Trama (whitelist de `useInitialView`). */
const TRAMA_VIEWS = [
  'inicio',
  'grafo',
  'entidades',
  'citas',
  'escuchas',
  'twitter',
  'momentos',
  'cronologia',
  'atlas',
  'chat',
  'sugerencias',
] as const

/** Las 8 secciones del mundo Notas (`NOTAS_SECTIONS`). */
const NOTAS_SECTIONS = [
  'inicio',
  'notas',
  'tareas',
  'prompts',
  'claves',
  'pdf',
  'planillas',
  'biblioteca',
] as const

/**
 * Los tres temas viven en clases sobre `<html>` (ver `useTheme`): día es la
 * ausencia de ambas, noche es `dark`, y vela es `dark theme-vela`. Se conmutan
 * en la página para no pagar una recarga por tema.
 */
const THEMES = [
  { name: 'día', dark: false, vela: false },
  { name: 'noche', dark: true, vela: false },
  { name: 'vela', dark: true, vela: true },
] as const

type Finding = { surface: string; theme: string; kind: string; detail: string }

async function applyTheme(
  page: import('@playwright/test').Page,
  theme: (typeof THEMES)[number],
) {
  await page.evaluate(({ dark, vela }) => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.classList.toggle('theme-vela', vela)
  }, theme)
  // Las transiciones de color son ~150ms; medir antes da colores a medio camino.
  await page.waitForTimeout(250)
}

async function sweepSurface(
  page: import('@playwright/test').Page,
  url: string,
  surface: string,
  findings: Finding[],
) {
  await page.goto(url)
  // Algunas secciones titulan con h1 y otras con h2; y las pesadas (pdf,
  // planillas) tardan en montar. Si no aparece ninguna, seguimos igual: el
  // objetivo es barrer, no exigir una forma concreta.
  await page
    .locator('main h1, main h2')
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {})
  await page.waitForTimeout(700)

  for (const theme of THEMES) {
    await applyTheme(page, theme)

    // Medimos con los scrollers en su tope: lo que el scroll libera no es
    // defecto (misma regla que el gate).
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('*'))) {
        if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight
      }
    })
    await page.waitForTimeout(300)

    for (const o of await findOcclusions(page)) {
      findings.push({
        surface,
        theme: theme.name,
        kind: 'ocluido',
        detail: `"${o.text}" — ${Math.round(o.coveredRatio * 100)}% por ${o.coveredBy}`,
      })
    }
    for (const u of await findUnreachable(page)) {
      findings.push({
        surface,
        theme: theme.name,
        kind: 'inalcanzable',
        detail: `"${u.text}" — ${u.hiddenPx}px recortados en ${u.tag}`,
      })
    }
  }
}

function printReport(findings: Finding[], surfaces: number) {
  const bySurface = new Map<string, Finding[]>()
  for (const f of findings) {
    const list = bySurface.get(f.surface) ?? []
    list.push(f)
    bySurface.set(f.surface, list)
  }

  console.log(`\n${'='.repeat(72)}`)
  console.log(`BARRIDO DEL CONTRATO VISUAL — ${surfaces} superficies × 3 temas`)
  console.log('='.repeat(72))

  if (findings.length === 0) {
    console.log('\nSin hallazgos.\n')
    return
  }

  for (const [surface, list] of [...bySurface.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`\n▸ ${surface}  (${list.length})`)
    // Un mismo defecto suele repetirse en los tres temas; lo agrupamos para
    // que el informe se lea por causa y no por combinación.
    const seen = new Map<string, string[]>()
    for (const f of list) {
      const key = `${f.kind}: ${f.detail}`
      seen.set(key, [...(seen.get(key) ?? []), f.theme])
    }
    for (const [key, themes] of seen) {
      const scope = themes.length === THEMES.length ? 'los 3 temas' : themes.join(', ')
      console.log(`    ${key}  [${scope}]`)
    }
  }

  console.log(`\n${'-'.repeat(72)}`)
  console.log(
    `TOTAL: ${findings.length} hallazgos en ${bySurface.size} de ${surfaces} superficies`,
  )
  console.log(`${'-'.repeat(72)}\n`)
}

/**
 * Calibración de la sonda — este test SÍ bloquea, y a propósito.
 *
 * `findUnreachable` nació reportando 39 hallazgos y terminó en cero tras tres
 * exclusiones (`overflow: visible` no recorta, `.sr-only` es invisible por
 * diseño, un `max-height` inline es un colapso deliberado). Las tres se
 * justifican, pero el patrón —ajustar el instrumento hasta que calle— es
 * exactamente cómo se construye un gate inútil.
 *
 * Así que la sonda tiene que demostrar que sigue viendo: un caso positivo
 * sintético que debe detectar, y su control negativo, que no.
 */
test('la sonda de recorte sigue detectando contenido inalcanzable', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await enableDemoMode(page)
  await page.goto('/?view=inicio')
  await page.locator('main h1, main h2').first().waitFor({ timeout: 15_000 })

  // Positivo: caja de alto fijo, sin scroll, con más texto del que cabe.
  await page.evaluate(() => {
    const box = document.createElement('div')
    box.id = 'sonda-positiva'
    box.style.cssText = 'height:20px;overflow:hidden'
    box.textContent = 'Texto que no cabe y que nadie puede alcanzar. '.repeat(8)
    document.querySelector('main')!.appendChild(box)
  })
  const detectado = await findUnreachable(page)
  expect(
    detectado.some((f) => f.text.includes('nadie puede alcanzar')),
    'la sonda dejó de detectar un recorte evidente',
  ).toBe(true)

  // Control negativo: la misma caja, pero con scroll. El usuario puede llegar,
  // así que NO es defecto.
  await page.evaluate(() => {
    const box = document.getElementById('sonda-positiva')!
    box.style.overflowY = 'auto'
  })
  const conScroll = await findUnreachable(page)
  expect(
    conScroll.some((f) => f.text.includes('nadie puede alcanzar')),
    'la sonda reporta contenido que el scroll sí alcanza',
  ).toBe(false)
})

test('barrido del contrato visual (informe, no bloquea)', async ({ page }) => {
  test.skip(!ENABLED, 'opt-in: VISUAL_SWEEP=1 (npm run e2e:visual-sweep)')
  test.setTimeout(600_000)

  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await enableDemoMode(page)

  const findings: Finding[] = []
  const surfaces = TRAMA_VIEWS.length + NOTAS_SECTIONS.length

  for (const view of TRAMA_VIEWS) {
    // Una superficie que reviente no puede llevarse el barrido entero: se
    // anota como hallazgo y seguimos.
    try {
      await sweepSurface(page, `/?view=${view}`, `trama/${view}`, findings)
    } catch (err) {
      findings.push({
        surface: `trama/${view}`,
        theme: '—',
        kind: 'ERROR',
        detail: err instanceof Error ? err.message.slice(0, 120) : String(err),
      })
    }
  }

  for (const section of NOTAS_SECTIONS) {
    try {
      await sweepSurface(
        page,
        `/?world=notas&section=${section}`,
        `notas/${section}`,
        findings,
      )
    } catch (err) {
      findings.push({
        surface: `notas/${section}`,
        theme: '—',
        kind: 'ERROR',
        detail: err instanceof Error ? err.message.slice(0, 120) : String(err),
      })
    }
  }

  printReport(findings, surfaces)
})
