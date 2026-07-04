import type { ReactNode } from 'react'
import { sectionWashStyle } from '../lib/sectionWash'

/**
 * Header canónico de cada vista. Hasta este componente había 4 variantes
 * distintas para el mismo gesto (text-4xl / text-2xl / text-[28px] /
 * text-h1). Ahora todas las vistas (Inicio, Grafo, Entidades, Citas,
 * Momentos, Escuchas, Sugerencias, Chat, Configuración) producen el
 * mismo gesto: eyebrow editorial → h2 serif → accent-rule → subtitle.
 *
 * Props:
 *   - title       string (ej "Citas")
 *   - eyebrow     string corto que entra arriba en small-caps serif
 *   - subtitle?   párrafo explicativo opcional (mt-2 text-sm text-ink-400)
 *   - accent?     CSS var del color de la sección (controla wash + eyebrow).
 *                 Default 'var(--accent-gold)'.
 *   - eyebrowColor?  color del eyebrow si difiere del accent (algunas
 *                    vistas usan section-color en el wash pero gold en
 *                    el eyebrow — el patrón hereda esa flexibilidad).
 *                    Default = accent.
 *   - noWash?     si true, no aplica el radial wash de fondo.
 *                 Default false.
 *   - action?     slot para botones a la derecha (alineados al baseline).
 *   - spacing?    margen inferior — 'tight' (mb-6), 'normal' (mb-8),
 *                 'wide' (mb-10). Default 'normal'.
 *   - density?    'compact' reduce el gesto (título menor, regla y
 *                 subtítulo apretados) para vistas de uso diario donde el
 *                 hero grande cuesta scroll. Default 'default'.
 *   - sticky?     si true, el header se queda fijo al hacer scroll con
 *                 backdrop-blur. Útil para vistas largas (Citas,
 *                 Momentos, Entidades) donde el contexto se pierde al
 *                 scrollear.
 *                 Default false.
 */
export function ViewHeader({
  title,
  eyebrow,
  subtitle,
  accent = 'var(--accent-gold)',
  eyebrowColor,
  noWash = false,
  action,
  icon,
  spacing = 'normal',
  density = 'default',
  sticky = false,
}: {
  title: string
  eyebrow: string
  subtitle?: ReactNode
  accent?: string
  eyebrowColor?: string
  noWash?: boolean
  action?: ReactNode
  /** Logo/marca opcional junto al título (ej. logo oficial de X o Spotify). */
  icon?: ReactNode
  spacing?: 'tight' | 'normal' | 'wide'
  density?: 'default' | 'compact'
  sticky?: boolean
}) {
  const compact = density === 'compact'
  const spacingClass =
    spacing === 'tight' ? 'mb-6' : spacing === 'wide' ? 'mb-10' : 'mb-8'

  // Sticky compone: position sticky + backdrop blur + border-bottom
  // sutil cuando scrollea. El paper-50/85 + backdrop-blur-md es el
  // patrón Linear/Things. Cuando sticky=true dropeamos el wash y los
  // márgenes negativos — la identidad cromática vive en el eyebrow
  // color + accent-rule del título; el wash compite visualmente con
  // el contenido borroso de atrás.
  // Cuando el header está sticky, lo dejamos casi opaco (paper-50/98) +
  // backdrop-blur como salvaguarda. Antes con /85 el contenido scrolleado
  // (fotos, imágenes) se filtraba detrás del título y se veía sucio.
  const stickyClass = sticky
    ? 'sticky top-0 z-20 bg-paper-50/98 backdrop-blur-md border-b border-ink-100/40'
    : ''

  // Wash radial sutil del color del section accent. Da identidad
  // cromática a la vista sin gritar. Se desactiva cuando sticky=true.
  const useWash = !noWash && !sticky
  // En móvil el header apila: título a todo el ancho y las acciones DEBAJO.
  // Antes era `flex ... justify-between` siempre, así que el slot de acciones
  // (Imprenta, Añadir…) le robaba ~la mitad del ancho al título y el subtítulo
  // quedaba envuelto a una palabra por línea. De sm hacia arriba vuelve a la
  // fila con las acciones a la derecha.
  const layoutClass =
    'flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
  const baseClass = useWash
    ? `${layoutClass} px-3 -mx-3 py-2 -my-2 rounded-lg`
    : layoutClass

  const finalEyebrowColor = eyebrowColor ?? accent

  return (
    <header
      className={`${spacingClass} ${stickyClass} ${baseClass}`}
      style={useWash ? sectionWashStyle(accent) : undefined}
    >
      <div className="min-w-0">
        <p
          className={`section-eyebrow-serif ${compact ? 'mb-1' : 'mb-2'}`}
          style={{ color: finalEyebrowColor }}
        >
          {eyebrow}
        </p>
        <div className="flex items-center gap-2.5">
          {icon && <span className="shrink-0 text-ink-700">{icon}</span>}
          {/* Título fluido: 30px en móvil (menos ceremonial en pantallas
              chicas), 36px de sm hacia arriba — donde antes era text-4xl fijo
              y se sentía sobredimensionado al abrir una vista en el teléfono. */}
          <h2
            className={`font-serif text-ink-700 leading-none ${
              compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            {title}
          </h2>
        </div>
        <div className={`accent-rule ${compact ? 'mt-2 mb-1' : 'mt-3 mb-2'}`} />
        {subtitle && (
          <p
            className={`text-ink-400 leading-relaxed max-w-2xl ${
              compact ? 'mt-1 text-caption' : 'mt-2 text-body'
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
