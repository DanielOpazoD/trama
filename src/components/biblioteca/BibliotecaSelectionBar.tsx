import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { requestBlob } from '../../api/request'
import { invalidateBibliotecaSurface } from '../../state/cacheInvalidation'
import { useToast } from '../../state'
import { useAddMomento } from '../../state/useMomentos'
import type { LibraryItem } from '../../types/biblioteca'
import { FilePdfIcon, MomentosIcon, TrashIcon } from '../Icons'
import { Tooltip } from '../Tooltip'
import { readImageDimensions, readVideoDimensions } from '../momentos/helpers'
import {
  canSendLibraryItemToImprenta,
  libraryItemsToPdfFiles,
} from '../../lib/pdfStudio/import/libraryItemsToPdfFiles'
import {
  canSendLibraryItemToMomentos,
  libraryItemsToMomentoItems,
} from '../../lib/momentos/import/libraryItemsToMomentoItems'

/**
 * Barra flotante de acciones en lote para los archivos seleccionados de la
 * Biblioteca. Espejo de `RecorteSelectionBar` (Capturas): pegada al fondo,
 * muestra el conteo y las acciones —Enviar a Imprenta, Enviar a Momentos,
 * Eliminar (a la papelera, con deshacer)— aplicadas a toda la selección de una
 * vez, más "Deseleccionar todo".
 *
 * Ambos "Enviar a" siguen el mismo patrón: un predicado puro decide qué items
 * acepta el destino y habilita el botón, y el envío reporta éxito parcial.
 *
 *   - **Imprenta** ingiere imágenes y PDFs servibles; baja sus blobs y los
 *     entrega como `File`s vía `onSendToImprenta` (que los enruta al estudio).
 *   - **Momentos** ingiere imágenes y videos, EXCEPTO los que ya son de
 *     Momentos (la Biblioteca proyecta ese store, así que reenviarlos
 *     duplicaría el episodio). Copia los blobs al store de Momentos y crea un
 *     único episodio con todos.
 *
 * NOTA — "Eliminar definitivamente" (purga del blob) NO va en esta PR: para los
 * items que la Biblioteca no posee (adjuntos, recortes, momentos, PDFs) sería una
 * acción destructiva cross-dominio; la Biblioteca solo proyecta esas fuentes. El
 * borrado permanente vivirá con la feature de subida (donde la Biblioteca sí es
 * dueña del blob). Acá solo mandamos a la papelera (soft-delete) con deshacer.
 */
export function BibliotecaSelectionBar({
  selected,
  onClear,
  onSendToImprenta,
}: {
  selected: LibraryItem[]
  /** Limpia la selección (y cierra la barra). */
  onClear: () => void
  /** Recibe los File listos para Imprenta; los enruta al estudio PDF. */
  onSendToImprenta?: (files: File[]) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const addMomento = useAddMomento()
  const [busy, setBusy] = useState<'imprenta' | 'momentos' | 'delete' | null>(null)

  if (selected.length === 0) return null

  const n = selected.length
  const imprentaItems = selected.filter(canSendLibraryItemToImprenta)
  const canSendToImprenta = !!onSendToImprenta && imprentaItems.length > 0
  const momentosItems = selected.filter(canSendLibraryItemToMomentos)
  const canSendToMomentos = momentosItems.length > 0

  async function handleSendToImprenta() {
    if (busy || !onSendToImprenta) return
    setBusy('imprenta')
    try {
      const { files, failures } = await libraryItemsToPdfFiles(imprentaItems, {
        fetchBlob: requestBlob,
      })
      if (files.length === 0) {
        toast.show({
          message:
            failures.length > 0
              ? 'No se pudo enviar ningún archivo a Imprenta'
              : 'No hay archivos para enviar a Imprenta',
          tone: 'error',
        })
        return
      }
      onSendToImprenta(files)
      toast.show({
        message:
          failures.length > 0
            ? `${files.length} de ${files.length + failures.length} archivos enviados a Imprenta`
            : `${files.length} ${files.length === 1 ? 'archivo enviado' : 'archivos enviados'} a Imprenta`,
        tone: failures.length > 0 ? 'default' : 'success',
      })
      onClear()
    } catch (error) {
      toast.show({
        message:
          error instanceof Error
            ? error.message
            : 'No se pudieron enviar los archivos a Imprenta',
        tone: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * Crea UN episodio de Momentos con toda la media seleccionada, igual que el
   * composer al elegir varias fotos de una vez: `items[]` es un episodio, no una
   * foto. Enviar cinco imágenes produce un momento de cinco, no cinco momentos
   * sueltos que habría que fusionar después.
   */
  async function handleSendToMomentos() {
    if (busy) return
    setBusy('momentos')
    try {
      const { items, failures } = await libraryItemsToMomentoItems(momentosItems, {
        fetchBlob: requestBlob,
        uploadMedia: api.uploadMedia,
        readImageDimensions,
        readVideoDimensions,
      })
      if (items.length === 0) {
        toast.show({
          message:
            failures.length > 0
              ? 'No se pudo enviar ningún archivo a Momentos'
              : 'No hay imágenes ni videos para enviar a Momentos',
          tone: 'error',
        })
        return
      }
      const [first] = items
      await addMomento.mutateAsync({
        kind: 'foto',
        payload: {
          items,
          // Espejo del composer: el campo legacy conserva la primera para los
          // renders viejos que aún no leen `items[]`.
          storageKey: first?.storageKey,
          width: first?.width,
          height: first?.height,
        },
      })
      toast.show({
        message:
          failures.length > 0
            ? `${items.length} de ${items.length + failures.length} archivos enviados a Momentos`
            : `${items.length} ${items.length === 1 ? 'archivo enviado' : 'archivos enviados'} a Momentos`,
        tone: failures.length > 0 ? 'default' : 'success',
      })
      onClear()
    } catch (error) {
      toast.show({
        message:
          error instanceof Error
            ? error.message
            : 'No se pudieron enviar los archivos a Momentos',
        tone: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    if (busy) return
    setBusy('delete')
    // Secuencial a propósito (mismo criterio que RecorteSelectionBar): el store
    // read-modify-write del modo prueba se pisa con escrituras concurrentes, y de
    // paso no spameamos la DB. La selección suele ser un puñado de items.
    const ok: LibraryItem[] = []
    try {
      for (const item of selected) {
        try {
          await api.biblioteca.setDeleted(item.kind, item.itemId, true)
          ok.push(item)
        } catch {
          /* best-effort: seguimos con el resto */
        }
      }
      invalidateBibliotecaSurface(queryClient)
      toast.show({
        message: `${ok.length} ${ok.length === 1 ? 'archivo eliminado' : 'archivos eliminados'}`,
        durationMs: 10_000,
        action: {
          label: 'Deshacer',
          onAction: async () => {
            for (const item of ok) {
              await api.biblioteca
                .setDeleted(item.kind, item.itemId, false)
                .catch(() => {})
            }
            invalidateBibliotecaSurface(queryClient)
          },
        },
      })
      onClear()
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-100/70 hover:text-ink-800 disabled:opacity-50 motion-reduce:transition-none'

  return (
    <div
      role="toolbar"
      aria-label="Acciones de los archivos seleccionados"
      /* Centrado por márgenes automáticos, NO por `-translate-x-1/2`: los
         keyframes de `fade-up` terminan en `transform: translateY(0)`, que
         reemplaza el transform entero y borraría el centrado en X — la barra
         quedaba anclada al 50% y se salía por la derecha. */
      className="fixed bottom-6 inset-x-0 z-40 mx-auto w-[calc(100%-2rem)] max-w-2xl animate-fade-up"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100/80 px-4 py-3 shadow-xl shadow-ink-900/15"
        style={{ backgroundColor: 'rgb(var(--paper-50))' }}
      >
        <span className="text-sm font-medium tabular-nums text-ink-700">
          {n} {n === 1 ? 'seleccionado' : 'seleccionados'}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {onSendToImprenta && (
            <Tooltip
              content={
                canSendToImprenta
                  ? 'Enviar a Imprenta'
                  : 'Solo imágenes y PDFs se pueden enviar a Imprenta'
              }
            >
              {/* `aria-disabled` (no `disabled` nativo) para que el Tooltip siga
                  recibiendo hover/focus y pueda explicar por qué no se habilita. */}
              <button
                type="button"
                aria-disabled={!canSendToImprenta || !!busy}
                onClick={() => {
                  if (!canSendToImprenta || busy) return
                  void handleSendToImprenta()
                }}
                className={`${btn} ${
                  !canSendToImprenta || busy ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                <FilePdfIcon size={14} />{' '}
                {busy === 'imprenta' ? '…' : 'Enviar a Imprenta'}
              </button>
            </Tooltip>
          )}
          <Tooltip
            content={
              canSendToMomentos
                ? 'Enviar a Momentos'
                : 'Solo imágenes y videos que no sean ya de Momentos'
            }
          >
            {/* Mismo criterio que Imprenta: `aria-disabled` en vez de `disabled`
                nativo para que el Tooltip siga explicando por qué no se habilita. */}
            <button
              type="button"
              aria-disabled={!canSendToMomentos || !!busy}
              onClick={() => {
                if (!canSendToMomentos || busy) return
                void handleSendToMomentos()
              }}
              className={`${btn} ${
                !canSendToMomentos || busy ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <MomentosIcon size={14} /> {busy === 'momentos' ? '…' : 'Enviar a Momentos'}
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!!busy}
            className={`${btn} text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay-soft)] hover:text-[color:var(--accent-clay)]`}
          >
            <TrashIcon size={14} /> {busy === 'delete' ? '…' : 'Eliminar'}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!!busy}
            className="section-eyebrow ml-1 transition-colors hover:text-ink-700 motion-reduce:transition-none"
          >
            Deseleccionar todo
          </button>
        </div>
      </div>
    </div>
  )
}
