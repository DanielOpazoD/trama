import type { CSSProperties } from 'react'

/**
 * ω-B: wash radial sutil para el header de cada vista. Replica el
 * patrón del Inicio (que ya tenía un gradiente gold en su hero) pero
 * coloreado con el accent específico de cada sección — entidades en
 * marrón persona, citas en gold, momentos en evento, escuchas en
 * musico, etc.
 *
 * El gradiente se aplica como `background-image` del header. Es
 * extremadamente sutil (color a ~10-12% sobre paper-50) — la idea
 * es que el cuadrante superior izquierdo "respire" el color de la
 * sección sin que sea decorativo invasivo.
 *
 * Uso:
 *   <header style={sectionWashStyle('var(--type-persona)')}>
 *
 * El argumento es cualquier CSS color (CSS var, hex, rgb, hsl…). Usa
 * color-mix en srgb para mezclar con transparente — soporte universal
 * en navegadores modernos.
 */
export function sectionWashStyle(color: string): CSSProperties {
  return {
    backgroundImage: `radial-gradient(ellipse 60% 80% at 15% 20%, color-mix(in srgb, ${color} 12%, transparent) 0%, transparent 70%)`,
  }
}
