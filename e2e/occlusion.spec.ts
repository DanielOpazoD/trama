import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * Gate anti-oclusión — falla el CI cuando un texto queda tapado por otro
 * elemento de la interfaz.
 *
 * Por qué existe: la suite unitaria corre en happy-dom, que NO hace layout.
 * `toBeInTheDocument()` prueba presencia en el árbol, jamás visibilidad en
 * pantalla, así que un texto puede tener su test en verde y estar cubierto
 * por un panel flotante. Pasó dos veces:
 *
 *   - el CTA del estado vacío de Inicio ("empieza pegando algo abajo ↓")
 *     quedaba 105px debajo del composer, con el scroll ya en su tope;
 *   - el chip "leyenda" del Grafo pisaba 80px de "N entidades · N relaciones".
 *
 * Ambos con su test unitario pasando. Este gate cierra ese punto ciego: es lo
 * único de la suite que mira geometría real de pintado.
 *
 * Cómo funciona: por cada nodo de texto visible dentro del viewport toma el
 * rectángulo de su PRIMERA línea, lo recorta contra los ancestros que hacen
 * clipping y dispara `document.elementFromPoint()` sobre puntos repartidos a
 * lo ancho. Si el elemento devuelto no es el propio nodo, ni un ancestro, ni
 * un descendiente, ese punto está tapado.
 *
 * Corre siempre en modo prueba, con dos datasets: sembrado y vacío. Hace falta
 * el par — el pie del Grafo sólo existe cuando hay entidades, y los estados
 * vacíos son justo donde un panel flotante tiene espacio libre que invadir.
 */

/** Fracción de la línea que debe estar tapada para reportar. */
const OCCLUSION_THRESHOLD = 1 / 3

/** Puntos de muestreo a lo ancho de la línea. 12 da resolución de ~8%. */
const SAMPLES = 12

type Occlusion = {
  text: string
  tag: string
  coveredRatio: number
  coveredBy: string
}

/**
 * Corre la sonda dentro de la página. Todo el cuerpo se serializa al browser,
 * así que no puede cerrar sobre nada del scope de Node.
 */
async function findOcclusions(page: Page): Promise<Occlusion[]> {
  return page.evaluate(
    ({ threshold, samples }) => {
      const describe = (el: Element): string => {
        const cls =
          typeof el.className === 'string' && el.className
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        const label = el.getAttribute('aria-label')
        return `${el.tagName.toLowerCase()}${cls}${label ? `[${label}]` : ''}`
      }

      // Un ancestro invisible esconde a todo su subárbol; hay que subir la
      // cadena porque `getComputedStyle` no hereda opacity/visibility.
      //
      // A propósito NO miramos `aria-hidden`: significa "no expuesto a
      // tecnología asistiva", no "no pintado". El CTA de Inicio es
      // justamente eso — una pista visual con `aria-hidden` porque la
      // flecha ↓ no dice nada leída en voz alta — y saltárselo dejaba
      // fuera del gate el defecto que lo motivó.
      const isHidden = (el: Element): boolean => {
        let node: Element | null = el
        while (node) {
          const s = getComputedStyle(node)
          if (s.display === 'none' || s.visibility === 'hidden') return true
          if (Number(s.opacity) < 0.1) return true
          node = node.parentElement
        }
        return false
      }

      /**
       * Recorta el rect contra cada ancestro que hace clipping. Sin esto, un
       * texto con `text-overflow: ellipsis` reporta el ancho COMPLETO del
       * texto sin truncar, y todo lo que viva a la derecha del recorte cuenta
       * como si lo tapara. Fue el primer falso positivo que dio este gate.
       */
      const clipToAncestors = (el: Element, rect: DOMRect) => {
        let left = rect.left
        let right = rect.right
        let top = rect.top
        let bottom = rect.bottom
        let node: Element | null = el
        while (node && node !== document.documentElement) {
          const s = getComputedStyle(node)
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
            const b = node.getBoundingClientRect()
            left = Math.max(left, b.left)
            right = Math.min(right, b.right)
            top = Math.max(top, b.top)
            bottom = Math.min(bottom, b.bottom)
          }
          node = node.parentElement
        }
        return { left, right, top, bottom }
      }

      const results: Array<{
        text: string
        tag: string
        coveredRatio: number
        coveredBy: string
      }> = []

      const main = document.querySelector('main') ?? document.body
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim()
        if (text.length < 3) continue

        const parent = node.parentElement
        if (!parent) continue

        // El grafo es SVG y sus etiquetas se solapan entre sí por diseño
        // (layout de fuerzas); medir ahí sería ruido puro. El chrome HTML
        // alrededor del canvas sí se mide, que es donde vivía el bug real.
        if (parent.closest('svg, canvas')) continue
        if (isHidden(parent)) continue

        const range = document.createRange()
        range.selectNodeContents(node)
        const raw = range.getClientRects()[0]
        range.detach()
        if (!raw || raw.width < 8 || raw.height < 4) continue

        const box = clipToAncestors(parent, raw)
        if (box.right - box.left < 8 || box.bottom - box.top < 4) continue

        // Fuera del viewport no es oclusión, es contenido al que todavía no
        // se hizo scroll. Sólo medimos lo que el usuario tiene delante.
        const y = (box.top + box.bottom) / 2
        if (y < 0 || y > window.innerHeight) continue

        const width = box.right - box.left
        let covered = 0
        let usable = 0
        let culprit = ''

        // `elementFromPoint` atraviesa lo que tenga `pointer-events: none`, así
        // que un texto decorativo (la barra de contadores del Grafo lo es)
        // saldría SIEMPRE como tapado aunque se pinte perfectamente encima.
        // Le devolvemos el hit-testing durante la medición y lo restauramos
        // después: así el resultado refleja orden de pintado, que es lo que ve
        // el usuario, y no orden de eventos.
        const restore: Array<[HTMLElement, string]> = []
        for (let a: Element | null = parent; a; a = a.parentElement) {
          if (getComputedStyle(a).pointerEvents === 'none' && a instanceof HTMLElement) {
            restore.push([a, a.style.pointerEvents])
            a.style.pointerEvents = 'auto'
          }
        }

        for (let i = 0; i < samples; i++) {
          const x = box.left + (width * (i + 0.5)) / samples
          if (x < 0 || x > window.innerWidth) continue
          usable++

          const hit = document.elementFromPoint(x, y)
          if (!hit) continue
          // Ancestro o descendiente cuentan como visible: el punto puede caer
          // en el hueco entre dos glifos y devolver al contenedor.
          if (hit === parent || parent.contains(hit) || hit.contains(parent)) continue

          // Ornamento SVG chico → decorativo, no oclusión. La comilla de
          // `QuoteMark` va en `absolute -top-3` y asoma sobre la cita anterior
          // a propósito ("epígrafe impreso"); contarla llenaba el gate de
          // ruido intermitente en Citas. El umbral distingue un glifo suelto
          // de una superficie: el lienzo del Grafo mide cientos de miles de
          // px² y sigue contando.
          if (hit.closest('svg')) {
            const hb = hit.getBoundingClientRect()
            if (hb.width * hb.height < 2500) continue
          }

          covered++
          if (!culprit) culprit = describe(hit)
        }

        for (const [el, prev] of restore) el.style.pointerEvents = prev

        if (usable === 0) continue
        const coveredRatio = covered / usable
        if (coveredRatio >= threshold) {
          results.push({
            text: text.slice(0, 70),
            tag: describe(parent),
            coveredRatio: Math.round(coveredRatio * 100) / 100,
            coveredBy: culprit,
          })
        }
      }

      return results
    },
    { threshold: OCCLUSION_THRESHOLD, samples: SAMPLES },
  )
}

function report(view: string, viewport: string, found: Occlusion[]): string {
  const lines = found.map(
    (o) =>
      `  · "${o.text}" (${o.tag}) — ${Math.round(o.coveredRatio * 100)}% tapado por ${o.coveredBy}`,
  )
  return `Texto ocluido en ?view=${view} @ ${viewport}:\n${lines.join('\n')}`
}

const VIEWPORTS = [
  { name: 'móvil 375×812', width: 375, height: 812 },
  { name: 'laptop 1280×720', width: 1280, height: 720 },
  { name: 'escritorio 1440×900', width: 1440, height: 900 },
] as const

/**
 * Vistas troncales, alcanzadas por deep-link para no depender del chrome.
 * `ready` es un elemento tardío de cada vista: esperar sólo al encabezado deja
 * medir el Grafo antes de que asiente el layout, y el pie con los contadores
 * todavía no existe (falso verde intermitente).
 */
const VIEWS = [
  { name: 'inicio', ready: null },
  { name: 'entidades', ready: null },
  { name: 'citas', ready: null },
  { name: 'momentos', ready: null },
  { name: 'grafo', ready: 'leyenda' },
] as const

/**
 * Dos datasets, porque los defectos viven en sitios distintos:
 *
 *   - «con datos» (modo prueba) reproduce el pie del Grafo con sus contadores,
 *     que sólo existe cuando hay entidades;
 *   - «vacía» cubre los estados vacíos, donde un composer flotante tiene mucho
 *     espacio libre que invadir y el contenido es demasiado corto para que el
 *     scroll rescate nada.
 *
 * El grafo se omite en la trama vacía: sin nodos no hay pie que medir y su
 * layout es lo más lento de montar.
 */
const DATASETS = [
  { label: 'con datos', empty: false, views: VIEWS },
  { label: 'trama vacía', empty: true, views: VIEWS.filter((v) => v.name !== 'grafo') },
] as const

for (const viewport of VIEWPORTS) {
  for (const dataset of DATASETS) {
    // Los estados vacíos no cambian de forma entre 1280 y 1440: la única
    // diferencia sería más aire. Corremos la trama vacía sólo en móvil y
    // laptop para no pagar dos veces la misma comprobación en CI.
    if (dataset.empty && viewport.width >= 1440) continue

    test(`sin texto ocluido — ${viewport.name} · ${dataset.label}`, async ({ page }) => {
      // Varias cargas frescas por viewport, cada una con su espera de asentado:
      // no entra en el timeout por defecto de 30s.
      test.setTimeout(120_000)

      // El splash es decorativo y dura ~1.9s; durante el fade cubre todo por
      // diseño. Lo saltamos igual que en el gate de a11y.
      await page.addInitScript(() => {
        window.sessionStorage.setItem('trama:splash-seen', '1')
      })
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await enableDemoMode(page)
      if (dataset.empty) {
        // Modo prueba con el almacén vacío = exactamente lo que ve quien entra
        // por "explorar sin cuenta". `enableDemoMode` sólo borra la clave, y al
        // faltar el store la app siembra datos de ejemplo; escribir un objeto
        // vacío hace que `normalizeStore` lo complete con colecciones vacías y
        // preserve el estado de primer arranque, que es donde viven los estados
        // vacíos y su CTA.
        await page.addInitScript(() => {
          window.localStorage.setItem('trama-demo-store', '{}')
        })
      }

      const failures: string[] = []

      for (const view of dataset.views) {
        // Carga fresca por vista, con el viewport ya fijado: los estados que se
        // miden en el montaje (overflow, encuadre del grafo) no se recalculan
        // al redimensionar, así que navegar es la única forma de reproducirlos.
        await page.goto(`/?view=${view.name}`)
        // Las vistas de Trama usan h2 vía <ViewHeader />, pero el Grafo titula
        // con h1 — esperamos cualquiera de los dos.
        await page.locator('main h1, main h2').first().waitFor({ timeout: 15_000 })
        if (view.ready) {
          await page
            .getByText(view.ready, { exact: false })
            .first()
            .waitFor({ timeout: 15_000 })
        }
        // Las entradas de vista usan la curva out-quart a ~1.15s; medir antes
        // de que asiente da rectángulos a mitad de transform.
        await page.waitForTimeout(500)

        // Medimos SIEMPRE con los scrollers en su tope, y sólo ahí. Un texto
        // que pasa por detrás de un panel flotante mientras scrolleas no es un
        // defecto: el scroll lo libera. Lo que buscamos es el texto que NO se
        // puede liberar — el que sigue tapado cuando ya no queda scroll — y el
        // que vive en una capa sin scroll (el pie del Grafo). Medir antes de
        // scrollear reportaba media lista de Entidades y Citas como ocluida.
        await page.evaluate(() => {
          for (const el of Array.from(document.querySelectorAll('*'))) {
            if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight
          }
        })
        await page.waitForTimeout(400)

        const found = await findOcclusions(page)
        if (found.length > 0) failures.push(report(view.name, viewport.name, found))
      }

      // Imprimimos antes de fallar: un diff de arrays no dice nada útil acá.
      if (failures.length > 0) console.log(failures.join('\n\n'))
      expect(failures).toEqual([])
    })
  }
}
