import type { Page } from '@playwright/test'

/**
 * Contrato visual: las sondas que miran lo que el usuario **puede o no puede
 * leer**, y que ninguna aserción de la suite unitaria puede expresar porque
 * happy-dom no hace layout.
 *
 * Viven aquí, y no dentro de un spec, porque las usan dos consumidores con
 * propósitos distintos: el gate que bloquea el CI sobre las superficies ya
 * limpias (`occlusion.spec.ts`) y el barrido que recorre toda la app en modo
 * informe (`visual-sweep.spec.ts`). Compartir el código es lo que impide que
 * el gate y el informe midan cosas distintas.
 */

/** Fracción de la línea que debe estar tapada para reportar. */
const OCCLUSION_THRESHOLD = 1 / 3

/** Puntos de muestreo a lo ancho de la línea. 12 da resolución de ~8%. */
const SAMPLES = 12

export type Occlusion = {
  text: string
  tag: string
  coveredRatio: number
  coveredBy: string
}

/**
 * Corre la sonda dentro de la página. Todo el cuerpo se serializa al browser,
 * así que no puede cerrar sobre nada del scope de Node.
 */
export async function findOcclusions(page: Page): Promise<Occlusion[]> {
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

export type Unreachable = {
  text: string
  tag: string
  hiddenPx: number
}

/**
 * Contenido **recortado sin salida**: el hermano de la oclusión.
 *
 * Un contenedor de alto fijo cuyo contenido no cabe deja lo que sobra fuera de
 * la pantalla. Si además no puede scrollear —`overflow` en `hidden` o
 * `visible`— ese contenido no es que esté tapado: es inalcanzable. Fue lo que
 * escondía el botón "cargar ejemplo" del estado vacío del Grafo, y lo que
 * `CenteredPane` arregla separando "scrollea" de "centra".
 *
 * Sólo se reporta cuando el desbordamiento es vertical y significativo (>8px):
 * los recortes horizontales suelen ser `text-overflow: ellipsis`, que es
 * deliberado.
 */
export async function findUnreachable(page: Page): Promise<Unreachable[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${cls}`
    }

    const results: Array<{ text: string; tag: string; hiddenPx: number }> = []
    const main = document.querySelector('main') ?? document.body

    for (const el of Array.from(main.querySelectorAll('*'))) {
      const hiddenPx = el.scrollHeight - el.clientHeight
      if (hiddenPx <= 8) continue

      const style = getComputedStyle(el)
      // Sólo `hidden`/`clip` recortan de verdad. `auto`/`scroll` los alcanza el
      // usuario, y `visible` —el caso por defecto— NO corta nada: el contenido
      // se sale y sigue pintándose, y si alguien lo recorta es un ancestro, que
      // ya se reporta por su cuenta. Incluir `visible` fue el error de
      // calibración de la primera pasada: llenó el informe de contenedores de
      // vista que no ocultaban absolutamente nada.
      if (style.overflowY !== 'hidden' && style.overflowY !== 'clip') continue
      // Un contenedor sin alto propio no recorta: el desbordamiento lo hereda
      // un ancestro y ya lo veremos allí.
      if (el.clientHeight === 0) continue
      // `.sr-only` es un recorte deliberado: texto para lectores de pantalla,
      // invisible por diseño en una caja de 1px.
      if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue
      // Un `max-height` inline es un colapso deliberado y calculado en runtime
      // —el patrón "preview plegado + botón de expandir" de `RecorteCardBody`—,
      // no un recorte accidental: esos vienen del layout (h-full + overflow),
      // nunca de un estilo inline.
      //
      // Es la única exclusión de las tres que es heurística y no un hecho de
      // CSS: si alguien pone `max-height` inline SIN dar forma de expandir, el
      // barrido no lo vería. A cambio, sin ella el informe se llena de previews
      // que funcionan como deben.
      if ((el as HTMLElement).style.maxHeight) continue
      // El lienzo del grafo desborda a propósito: el SVG es más grande que su
      // viewport y se navega con pan/zoom, no con scroll.
      //
      // Es la segunda heurística de la sonda (la otra es el `max-height`
      // inline de más abajo) y la más ancha de las cinco exclusiones: deja
      // ciego cualquier texto recortado dentro de un contenedor que además
      // albergue un SVG etiquetado, no sólo el lienzo. Si algún día hace falta
      // afinarla, el criterio honesto es identificar el lienzo por su rol y no
      // por "contiene un svg con aria-label".
      if (el.querySelector('svg[aria-label]')) continue

      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text.length < 3) continue

      results.push({ text: text.slice(0, 70), tag: describe(el), hiddenPx })
    }

    // Un contenedor recortado suele arrastrar a sus hijos: nos quedamos con el
    // más externo de cada cadena para no reportar el mismo defecto N veces.
    return results.filter(
      (r, i) => !results.some((o, j) => j < i && r.text.startsWith(o.text.slice(0, 40))),
    )
  })
}
