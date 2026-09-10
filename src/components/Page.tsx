import type { ReactNode } from 'react'

/**
 * La columna de una página: ancho, padding, apertura/cierre y ritmo entre
 * secciones. Las cuatro decisiones que hoy toma cada vista por su cuenta.
 *
 * POR QUÉ EXISTE. Una medición de nueve superficies encontró doce valores
 * verticales distintos y hasta 588 px muertos bajo el contenido (Imprenta),
 * 487 en Cronología y 327 en Atlas. No es descuido de nadie: no había dónde
 * declarar el ritmo, así que cada vista lo improvisaba con clases sueltas.
 *
 * NO ES UN SCROLLER, y no puede serlo. El feed virtualizado se ata por id a
 * `document.getElementById('main-scroll')` y mide su scrollMargin contra ESE
 * nodo; interponer otro scroller rompería la virtualización de Entidades,
 * Citas y el feed de Notas a la vez. `Page` es siempre el hijo, nunca la caja
 * que scrollea.
 *
 * CONTRATO DEL PADRE: para que `align="fill"` signifique algo, `Page` debe
 * montarse dentro de un contenedor `flex flex-col` con alto definido. Si el
 * padre no lo es, `fill` se comporta como `top` — se degrada, no se rompe.
 */

/** Los dos carriles que ya existían: 768px en el mundo Trama, 1024px en Notas. */
export type PageWidth = 'reading' | 'workbench'

/** Ancho y padding horizontal juntos: cada carril ya tenía el suyo y se respeta. */
const WIDTH_CLASS: Record<PageWidth, string> = {
  reading: 'max-w-3xl px-8',
  workbench: 'max-w-5xl px-5 md:px-8',
}

/**
 * Dos roles, no una escala numérica: entre SECCIONES de una vista (44px) y
 * entre BLOQUES de cromo dentro de una (22px). Si hiciera falta un tercero,
 * se añade cuando haya un uso real, no antes.
 */
const RHYTHM_CLASS = {
  section: 'gap-ritmo-seccion',
  block: 'gap-ritmo-bloque',
  none: '',
} as const

export type PageRhythm = keyof typeof RHYTHM_CLASS

export function Page({
  width = 'reading',
  /**
   * 'top': flujo normal, la columna crece con su contenido.
   * 'fill': la columna ocupa el alto disponible, para que un hijo marcado con
   * `PageFill` pueda repartirlo en vez de dejar un hueco muerto debajo.
   */
  align = 'top',
  /** El hueco entre hijos directos. Ver RHYTHM_CLASS. */
  rhythm = 'section',
  /**
   * Padding inferior, en línea. Por defecto `var(--space-6)`. Pasar `null`
   * cuando el cierre tiene que ser RESPONSIVE: un estilo en línea no admite
   * breakpoints, así que con `null` no se pone ninguno y lo decide
   * `className` (el caso de Notas: 96 px en móvil y 40 en escritorio).
   */
  paddingBottom,
  className = '',
  /** `data-testid` de la columna, para tests y e2e que ya se anclaban a ella. */
  testId,
  children,
}: {
  width?: PageWidth
  align?: 'top' | 'fill'
  rhythm?: PageRhythm
  paddingBottom?: string | null
  className?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <div
      // Ancla estable para los e2e y para el spec que mide el vector de huecos.
      data-page=""
      data-page-align={align}
      data-testid={testId}
      className={[
        'mx-auto w-full pt-ritmo-seccion',
        // Flex SOLO cuando hace falta. Un contenedor flex no colapsa los
        // márgenes verticales de sus hijos y uno de bloque sí: medido en
        // Cronología y Atlas, el encabezado (mb 24) y el contenido (mt 32)
        // colapsan hoy a 32 px, y en flex pasarían a 56. Las vistas del router
        // se espacian con márgenes, así que con `rhythm="none"` y `align="top"`
        // la columna sigue siendo un bloque.
        rhythm !== 'none' || align === 'fill' ? 'flex flex-col' : '',
        WIDTH_CLASS[width],
        RHYTHM_CLASS[rhythm],
        align === 'fill' ? 'flex-1' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        paddingBottom === null
          ? undefined
          : { paddingBottom: paddingBottom ?? 'var(--space-6)' }
      }
    >
      {children}
    </div>
  )
}

/**
 * El hijo que se queda con el alto sobrante de una `Page align="fill"`.
 *
 * `flex-1` A SECAS, nunca con `min-h-0`. Con `min-height:auto` la MISMA clase
 * sirve para los dos casos: si el contenido es corto (la zona de arrastre
 * vacía de Imprenta) se estira y llena; si es largo (cuarenta páginas) crece
 * con él y el scroller de arriba lo alcanza. Con `min-h-0` el caso corto
 * colapsaría a cero.
 *
 * `center` centra con MÁRGENES AUTOMÁTICOS, no con `justify-center`. La
 * diferencia importa: `justify-center` reparte el exceso a partes iguales
 * cuando el contenido no cabe, y lo de arriba queda en coordenadas negativas
 * donde ningún scroll llega —el problema que documenta CenteredPane—. Un
 * margen `auto` solo reparte lo que sobra: si no sobra nada, vale cero y no
 * hay nada fuera de alcance.
 */
export function PageFill({
  center = false,
  children,
}: {
  center?: boolean
  children: ReactNode
}) {
  return (
    <div data-page-fill="" className="flex flex-1 flex-col">
      {center ? <div className="m-auto w-full">{children}</div> : children}
    </div>
  )
}
