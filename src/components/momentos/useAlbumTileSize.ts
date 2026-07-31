import { useLocalStorageState } from '../../hooks/useLocalStorageState'

export type TileSize = 'small' | 'medium' | 'large'

export const TILE_SIZES: readonly TileSize[] = ['small', 'medium', 'large']
const SIZE_STORAGE_KEY = 'trama:album-size'

/**
 * Tamaño de las miniaturas del álbum, persistido entre sesiones.
 *
 * Vive fuera de `AlbumGrid` porque es un control de VISTA: se opera desde la
 * barra, junto a los filtros y al toggle Línea/Álbum, no desde dentro de la
 * grilla —donde su menú se comía una fila entera para sí solo—. La grilla lo
 * recibe ya resuelto por props, así que sigue siendo un componente tonto.
 *
 * El hook compartido valida lo que venga de localStorage: un valor manipulado
 * a mano cae al default en vez de romper la maqueta.
 */
export function useAlbumTileSize() {
  return useLocalStorageState<TileSize>(
    SIZE_STORAGE_KEY,
    'medium',
    (raw): raw is TileSize => TILE_SIZES.includes(raw as TileSize),
  )
}
