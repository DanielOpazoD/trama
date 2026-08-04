import type { CaptureItem, Recorte } from '../../api'
import { RecorteSelectionBar } from '../recortes/RecorteSelectionBar'
import { NotasImprentaSelectionBar } from './NotasImprentaSelectionBar'
import type { NotasFeedSegment } from './notasFeedViewModel'

/**
 * Las barras flotantes del modo selección del feed, UNA por familia de
 * segmento: en `capturas` la de triage completo (archivar/→Momento/eliminar/
 * Imprenta); en `escritas`/`todo` la de notas, que solo envía fotos a
 * Imprenta. Viven juntas para que `NotasFeedView` no ramifique por segmento
 * (y para no reventar su ratchet de líneas con dos bloques condicionales).
 */
export function NotasFeedSelectionBars({
  segment,
  selectionMode,
  selectedRecortes,
  selectedItems,
  onClear,
  onSendImagesToPdf,
  onSendItemsToImprenta,
}: {
  segment: NotasFeedSegment
  selectionMode: boolean
  selectedRecortes: Recorte[]
  selectedItems: CaptureItem[]
  onClear: () => void
  onSendImagesToPdf?: (selected: Recorte[]) => void
  onSendItemsToImprenta?: (items: CaptureItem[]) => Promise<void>
}) {
  if (!selectionMode) return null
  if (segment === 'capturas') {
    return (
      <RecorteSelectionBar
        selected={selectedRecortes}
        onClear={onClear}
        onDone={onClear}
        onSendImagesToPdf={onSendImagesToPdf}
      />
    )
  }
  if (!onSendItemsToImprenta) return null
  return (
    <NotasImprentaSelectionBar
      selectedItems={selectedItems}
      onClear={onClear}
      onSendToImprenta={onSendItemsToImprenta}
    />
  )
}
