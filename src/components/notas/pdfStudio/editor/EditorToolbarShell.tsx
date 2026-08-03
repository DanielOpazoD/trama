import { type ReactNode } from 'react'

/**
 * El armazón de la barra del editor: **qué scrollea y qué no**.
 *
 * Medido a 390px de ancho —un teléfono normal— cuando el `overflow-x-auto` se
 * aplicaba a la barra entera: mostraba 330px de un contenido de 607, o sea
 * **277px (el 46%) fuera de pantalla**, y el zoom estaba entre lo escondido. El
 * control más usado de un editor de PDF en pantalla pequeña quedaba detrás de un
 * scroll horizontal que además no se anuncia. A 768px y más cabía todo, así que
 * el defecto vivía sólo en el móvil, donde más molesta.
 *
 * La separación es el arreglo: las herramientas scrollean en su carril; el
 * `trailing` —hoy el zoom— se ancla fuera y siempre es alcanzable.
 *
 * El carril conserva `flex-nowrap`: la fila única es deliberada y hay un e2e que
 * la exige. El degradado del borde delata que hay más a la derecha; en pantallas
 * anchas las herramientas no llegan a ese borde, así que cae sobre vacío y no se
 * ve.
 *
 * Ojo al medir esto: el scroll vive en el carril INTERNO. Preguntarle
 * `scrollWidth` al `role="toolbar"` externo diría "no desborda" siempre, y sería
 * un verde falso.
 */
export function EditorToolbarShell({
  children,
  trailing,
}: {
  children: ReactNode
  /** Queda FUERA del carril que scrollea: siempre alcanzable. */
  trailing?: ReactNode
}) {
  return (
    <div
      role="toolbar"
      aria-label="Barra de herramientas de edición del PDF"
      className="flex shrink-0 items-center gap-1.5 border-b border-ink-100/70 bg-paper-50/95 px-2.5 py-1.5 shadow-sm shadow-ink-900/5"
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]">
        {children}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}
