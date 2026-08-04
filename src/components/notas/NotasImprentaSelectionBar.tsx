import { useState } from 'react'
import type { CaptureItem } from '../../api'
import { PrinterIcon } from '../Icons'
import { canSendNoteToImprenta } from '../../lib/pdfStudio/import/notesToPdfFiles'

/**
 * Barra flotante del modo selección en los segmentos de NOTAS (escritas/todo).
 * Hermana de `RecorteSelectionBar` (que sigue siendo la de capturas, con su
 * triage completo): esta tiene UNA sola acción — enviar las fotos de lo
 * seleccionado a Imprenta — porque es lo único que hoy tiene sentido en lote
 * para notas.
 *
 * El conteo distingue "seleccionados" de "con fotos": seleccionar tres notas
 * de las que solo una tiene imágenes debe decirlo ANTES de enviar, no después
 * con un toast de éxito parcial.
 */
export function NotasImprentaSelectionBar({
  selectedItems,
  onClear,
  onSendToImprenta,
}: {
  selectedItems: CaptureItem[]
  onClear: () => void
  onSendToImprenta: (items: CaptureItem[]) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)

  if (selectedItems.length === 0) return null

  const withImages = selectedItems.filter((item) =>
    item.type === 'note'
      ? canSendNoteToImprenta(item.note)
      : item.recorte.images.length > 0 || item.recorte.imageKey !== null,
  )
  const n = selectedItems.length

  async function send() {
    if (busy || withImages.length === 0) return
    setBusy(true)
    try {
      await onSendToImprenta(withImages)
      onClear()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Acciones de las notas seleccionadas"
      className="fixed bottom-6 inset-x-0 z-40 mx-auto w-[calc(100%-2rem)] max-w-2xl animate-fade-up"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100/80 px-4 py-3 shadow-xl shadow-ink-900/15"
        style={{ backgroundColor: 'rgb(var(--paper-50))' }}
      >
        <span className="text-caption font-medium tabular-nums text-ink-700">
          {n} {n === 1 ? 'seleccionada' : 'seleccionadas'}
          {withImages.length < n && (
            <span className="font-normal text-ink-400">
              {' '}
              · {withImages.length} con fotos
            </span>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || withImages.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption text-ink-600 transition-colors hover:bg-ink-100/70 hover:text-ink-800 disabled:opacity-50"
          >
            <PrinterIcon size={14} /> {busy ? '…' : 'Fotos a Imprenta'}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="section-eyebrow ml-1 transition-colors hover:text-ink-700"
          >
            cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
