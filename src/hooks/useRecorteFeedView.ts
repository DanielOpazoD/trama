import { useLocalStorageState } from './useLocalStorageState'

/**
 * Modo de visualización del feed de capturas: lista (el hilo unificado) o
 * galería (grilla tipo álbum, solo imágenes). Persistido en localStorage
 * `trama:recorteFeedView`. Default `list` — el feed mixto de siempre.
 */
export type RecorteFeedView = 'list' | 'galeria'

const isFeedView = (raw: string): raw is RecorteFeedView =>
  raw === 'list' || raw === 'galeria'

export function useRecorteFeedView(): [RecorteFeedView, (next: RecorteFeedView) => void] {
  return useLocalStorageState<RecorteFeedView>(
    'trama:recorteFeedView',
    'list',
    isFeedView,
  )
}
