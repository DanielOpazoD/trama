import { useLocalStorageState } from './useLocalStorageState'

/**
 * Tamaño de las miniaturas de imagen de las capturas en el feed de Notas,
 * persistido en localStorage `trama:recorteThumb`.
 *
 * Las capturas de imagen (recortes, fotos de WhatsApp) se mostraban a ancho
 * completo con un marco 16:9: demasiado grandes, dominaban la lista. Ahora el
 * usuario elige el tamaño de la miniatura. Default `mediana` — una miniatura
 * en la que se ve la imagen sin que coma media pantalla.
 */
export type RecorteThumbSize = 'pequena' | 'mediana' | 'grande'

const isThumbSize = (raw: string): raw is RecorteThumbSize =>
  raw === 'pequena' || raw === 'mediana' || raw === 'grande'

export function useRecorteThumbSize(): [
  RecorteThumbSize,
  (next: RecorteThumbSize) => void,
] {
  return useLocalStorageState<RecorteThumbSize>(
    'trama:recorteThumb',
    'mediana',
    isThumbSize,
  )
}
