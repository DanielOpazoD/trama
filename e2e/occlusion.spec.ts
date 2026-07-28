import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'
import { findOcclusions, type Occlusion } from './visualContract'

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
 * Tres datasets, porque los defectos viven en sitios distintos:
 *
 *   - «con datos» (modo prueba) reproduce el pie del Grafo con sus contadores,
 *     que sólo existe cuando hay entidades;
 *   - «vacía» cubre los estados vacíos, donde un composer flotante tiene mucho
 *     espacio libre que invadir y el contenido es demasiado corto para que el
 *     scroll rescate nada;
 *   - «trama grande» cruza el umbral de 100 nodos que hace aparecer el
 *     minimapa. Es la única forma de medir esa pieza: con la semilla de seis
 *     entidades no se monta, y mientras no se montó tapaba a la vez la leyenda
 *     y los contadores sin que ningún test lo viera.
 *
 * El grafo se omite en la trama vacía: sin nodos no hay pie que medir y su
 * layout es lo más lento de montar.
 */
const BIG_GRAPH_ENTITIES = 130

const DATASETS = [
  { label: 'con datos', seed: null, views: VIEWS },
  { label: 'trama vacía', seed: 'empty', views: VIEWS.filter((v) => v.name !== 'grafo') },
  { label: 'trama grande', seed: 'big', views: VIEWS.filter((v) => v.name === 'grafo') },
] as const

for (const viewport of VIEWPORTS) {
  for (const dataset of DATASETS) {
    // Los estados vacíos no cambian de forma entre 1280 y 1440: la única
    // diferencia sería más aire. Corremos la trama vacía sólo en móvil y
    // laptop para no pagar dos veces la misma comprobación en CI.
    if (dataset.seed === 'empty' && viewport.width >= 1440) continue
    // El minimapa sólo se monta a partir de `md`, así que la trama grande no
    // tiene nada nuevo que decir en móvil.
    if (dataset.seed === 'big' && viewport.width < 1280) continue

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
      if (dataset.seed === 'empty') {
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
      if (dataset.seed === 'big') {
        await page.addInitScript((count) => {
          const now = '2026-01-01T00:00:00.000Z'
          const types = ['escritor', 'libro', 'musico', 'banda', 'concepto']
          const entities = Array.from({ length: count }, (_, i) => ({
            id: `e${i}`,
            type: types[i % types.length],
            name: `Entidad ${i}`,
            year: 1900 + (i % 120),
            description: null,
            essay: null,
            position_x: null,
            position_y: null,
            origin: { kind: 'manual' },
            spotify_url: null,
            created_at: now,
            updated_at: now,
          }))
          const relationships = Array.from({ length: count - 1 }, (_, i) => ({
            id: `r${i}`,
            from_id: `e${i}`,
            to_id: `e${i + 1}`,
            type: 'influye_en',
            notes: null,
            origin: { kind: 'manual' },
            created_at: now,
            updated_at: now,
          }))
          window.localStorage.setItem(
            'trama-demo-store',
            JSON.stringify({ entities, relationships }),
          )
        }, BIG_GRAPH_ENTITIES)
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

/**
 * Hermano del gate de arriba: aquí el texto no está tapado, está **fuera de
 * alcance**. Centrar con `items-center` dentro de un alto fijo reparte el
 * exceso arriba y abajo cuando el contenido no cabe; lo de arriba queda en
 * coordenadas negativas y `scrollTop` no puede bajar de cero.
 *
 * El estado vacío del Grafo caía justo ahí: en un móvil en horizontal la cita
 * salía recortada y "cargar ejemplo" —la única acción de la pantalla— quedaba
 * bajo el borde inferior sin scroll que la rescatara. Es la primera pantalla
 * que ve alguien que abre Trama sin datos, así que el fallo se paga entero.
 *
 * No se puede comprobar en la suite unitaria: depende de layout real, y
 * happy-dom no lo hace.
 */
test('la acción del estado vacío se alcanza en pantallas bajas', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  // Móvil en horizontal. El ancho tiene que quedar por debajo de `md` para que
  // el shell monte la barra de navegación móvil: con ella el chrome se lleva
  // ~115px de alto y el contenido deja de caber, que es la condición del bug.
  // A 812px de ancho manda el layout de escritorio, el chrome baja a ~50px y
  // el estado vacío entra — ahí este test no probaría nada.
  await page.setViewportSize({ width: 667, height: 340 })
  await enableDemoMode(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('trama-demo-store', '{}')
    // `EmptyState` elige la cita con `Math.random()` entre cinco de largos
    // muy distintos. Sin fijarla, una cita corta deja el CTA ya visible y el
    // test pasaría sin haber probado nada. La fijamos en el índice 3, la más
    // larga, para que el desbordamiento sea siempre el mismo.
    Math.random = () => 0.7
  })

  await page.goto('/?view=grafo')
  const cta = page.getByRole('button', { name: /cargar ejemplo/i })
  await cta.waitFor({ timeout: 15_000 })

  // Primero probamos que el escenario es el que creemos: sin scrollear, el CTA
  // NO está a la vista. Sin esta aserción el test se volvería vacío en cuanto
  // el contenido encogiera, y dejaría de guardar nada sin avisar.
  await expect(cta).not.toBeInViewport()

  // Ojo con `scrollIntoViewIfNeeded`: scrollea el contenedor por API, y un
  // `overflow: hidden` SÍ acepta que le muevan `scrollTop` por código aunque
  // el usuario no pueda tocarlo. Con él, este test pasaba sobre el bug.
  // La rueda es lo que hace una persona, y sólo mueve lo que de verdad
  // scrollea.
  await page.mouse.move(406, 200)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(300)
  await expect(cta).toBeInViewport()

  // Y el copy no debe mandar a una barra que en el Grafo no se monta.
  await expect(page.locator('main')).not.toContainText('barra de abajo')
})
