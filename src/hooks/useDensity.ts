import { useLocalStorageNullable } from './useLocalStorageState'

/** Sobre este umbral de ítems, sin preferencia explícita, arrancamos compacto. */
const AUTO_COMPACT_OVER = 30

/**
 * Densidad de las vistas de catálogo (Citas, Entidades), compartida vía
 * localStorage `trama:density`.
 *
 * Tensión que resuelve: la generosidad editorial (serif grande, mucho aire) es
 * bellísima para leer pocos ítems pero lenta para escanear cientos. Si el
 * usuario no eligió todavía, arrancamos **compacto cuando la lista es larga**
 * (>30) y **cómodo cuando es corta** — lo mejor de los dos mundos. En cuanto
 * elige, su preferencia manda y persiste entre vistas y sesiones.
 */
export function useDensity(count: number): {
  compact: boolean
  setCompact: (next: boolean) => void
} {
  const [stored, setStored] = useLocalStorageNullable('trama:density')
  const compact = stored === null ? count > AUTO_COMPACT_OVER : stored === 'compacto'
  return {
    compact,
    setCompact: (next: boolean) => setStored(next ? 'compacto' : 'comodo'),
  }
}
