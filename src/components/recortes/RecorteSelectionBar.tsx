import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type PromoteRecorteInput, type Recorte } from '../../api'
import { useToast } from '../../state/toast'
import { queryKeys } from '../../state/queryClient'
import { ArchiveIcon, MomentosIcon, TrashIcon } from '../Icons'

/** Pies autogenerados que no vale la pena arrastrar como caption del momento. */
const IMAGE_PLACEHOLDERS = new Set([
  '📷 imagen desde whatsapp',
  'imagen guardada',
  'recorte visual de la página',
])

function captionOf(text: string): string | undefined {
  const t = text.trim()
  if (!t || IMAGE_PLACEHOLDERS.has(t.toLowerCase())) return undefined
  return t
}

/** Construye el input de promoción a Momento según la captura (foto vs texto). */
function momentoInputFor(r: Recorte): PromoteRecorteInput {
  if (r.imageKey) {
    return {
      target: 'momento',
      momento: {
        kind: 'foto',
        payload: { caption: captionOf(r.text) },
        note: r.note,
        capturedAt: r.capturedAt ?? r.createdAt,
      },
    }
  }
  return {
    target: 'momento',
    momento: {
      kind: 'recorte',
      payload: {
        bodyText: r.text.trim(),
        url: r.sourceUrl ?? undefined,
        title: r.sourceTitle ?? undefined,
        author: r.sourceAuthor ?? undefined,
      },
      note: r.note,
      capturedAt: r.capturedAt ?? r.createdAt,
    },
  }
}

type BulkAction = 'archive' | 'restore' | 'momento' | 'delete'

/**
 * Barra flotante de triage en lote para las capturas seleccionadas. Espejo de
 * `MergeMomentosBar` (Momentos): pegada al fondo, muestra el conteo y las
 * acciones —archivar, volver a pendientes, → Momento, eliminar— aplicadas a
 * todas las seleccionadas de una vez. Eliminar ofrece deshacer por toast.
 */
export function RecorteSelectionBar({
  selected,
  onClear,
  onDone,
}: {
  selected: Recorte[]
  onClear: () => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState<BulkAction | null>(null)

  if (selected.length === 0) return null

  const n = selected.length
  const anyArchived = selected.some((r) => r.status === 'archived')
  const anyActive = selected.some((r) => r.status !== 'archived')

  function invalidate() {
    qc.invalidateQueries({ queryKey: queryKeys.recortes })
    qc.invalidateQueries({ queryKey: queryKeys.notasFeed })
    qc.invalidateQueries({ queryKey: queryKeys.momentosInfinite })
    qc.invalidateQueries({ queryKey: queryKeys.counts })
    qc.invalidateQueries({ queryKey: queryKeys.home })
  }

  async function run(action: BulkAction) {
    if (busy) return
    setBusy(action)
    // Secuencial a propósito: no spameamos la DB y evitamos el clobber del
    // store read-modify-write del modo prueba (mismo criterio que el undo de
    // MergeMomentosBar). El triage suele ser un puñado de ítems.
    try {
      if (action === 'delete') {
        const ok: Array<{ id: string; deletedAt: string | null }> = []
        for (const r of selected) {
          try {
            const { deletedAt } = await api.removeRecorte(r.id)
            ok.push({ id: r.id, deletedAt })
          } catch {
            /* best-effort: seguimos con el resto */
          }
        }
        invalidate()
        toast.show({
          message: `${ok.length} ${ok.length === 1 ? 'captura eliminada' : 'capturas eliminadas'}`,
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              for (const x of ok) {
                if (x.deletedAt)
                  await api.restoreRecorte(x.id, x.deletedAt).catch(() => {})
              }
              invalidate()
            },
          },
        })
      } else if (action === 'archive' || action === 'restore') {
        const status = action === 'archive' ? 'archived' : 'pending'
        for (const r of selected) {
          await api.updateRecorte(r.id, { status }).catch(() => {})
        }
        invalidate()
        toast.show({
          message:
            action === 'archive'
              ? `${n} ${n === 1 ? 'archivada' : 'archivadas'}`
              : `${n} a pendientes`,
          tone: 'success',
        })
      } else if (action === 'momento') {
        let ok = 0
        for (const r of selected) {
          try {
            await api.promoteRecorte(r.id, momentoInputFor(r))
            ok++
          } catch {
            /* best-effort */
          }
        }
        invalidate()
        toast.show({
          message: `${ok} ${ok === 1 ? 'captura promovida' : 'capturas promovidas'} a Momentos`,
          tone: 'success',
        })
      }
      onDone()
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-100/70 hover:text-ink-800 disabled:opacity-50'

  return (
    <div
      role="toolbar"
      aria-label="Acciones de las capturas seleccionadas"
      className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 animate-fade-up"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100/80 px-4 py-3 shadow-xl shadow-ink-900/15"
        style={{ backgroundColor: 'rgb(var(--paper-50))' }}
      >
        <span className="text-sm font-medium tabular-nums text-ink-700">
          {n} {n === 1 ? 'seleccionada' : 'seleccionadas'}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => run('momento')}
            disabled={!!busy}
            className={btn}
          >
            <MomentosIcon size={14} /> {busy === 'momento' ? '…' : '→ Momento'}
          </button>
          {anyActive && (
            <button
              type="button"
              onClick={() => run('archive')}
              disabled={!!busy}
              className={btn}
            >
              <ArchiveIcon size={14} /> {busy === 'archive' ? '…' : 'Archivar'}
            </button>
          )}
          {anyArchived && (
            <button
              type="button"
              onClick={() => run('restore')}
              disabled={!!busy}
              className={btn}
            >
              {busy === 'restore' ? '…' : 'A pendientes'}
            </button>
          )}
          <button
            type="button"
            onClick={() => run('delete')}
            disabled={!!busy}
            className={`${btn} text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay-soft)] hover:text-[color:var(--accent-clay)]`}
          >
            <TrashIcon size={14} /> {busy === 'delete' ? '…' : 'Eliminar'}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!!busy}
            className="section-eyebrow ml-1 transition-colors hover:text-ink-700"
          >
            cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
