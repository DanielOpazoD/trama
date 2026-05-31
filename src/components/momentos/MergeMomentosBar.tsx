import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Momento, MomentoPayload } from '../../types'
import { api } from '../../api'
import { useMergeMomentos, useToast } from '../../state'
import { queryKeys } from '../../state/queryClient'

/**
 * EE: barra flotante de acción para fusionar momentos seleccionados.
 *
 * Aparece pegada al fondo de la viewport cuando `selectionMode=true`
 * y hay al menos 2 momentos seleccionados. Permite:
 *   - ver cuántos están seleccionados
 *   - elegir el "primary" (el que sobrevive con los datos del header)
 *   - opcionalmente sobreescribir note + capturedAt durante el merge
 *   - confirmar antes de fusionar (operación destructiva)
 *   - deshacer post-merge via toast (V1 pattern)
 *   - cancelar la selección
 *
 * Solo fusiona momentos kind='foto'. Los otros kinds quedan bloqueados.
 */
export function MergeMomentosBar({
  selected,
  onClear,
  onMerged,
}: {
  selected: Momento[]
  onClear: () => void
  onMerged: () => void
}) {
  const mergeMutation = useMergeMomentos()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [showOptions, setShowOptions] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [newCapturedAt, setNewCapturedAt] = useState('')
  const primarySelectId = useId()
  const noteInputId = useId()
  const capturedAtInputId = useId()

  if (selected.length < 2) return null

  const fotos = selected.filter((m) => m.kind === 'foto')
  const hasNonFoto = selected.length !== fotos.length

  // Default primary: el más viejo (orden cronológico ascendente). Si el
  // usuario no eligió otro, ese será el que sobrevive.
  const sortedByDate = [...fotos].sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1))
  const defaultPrimaryId = sortedByDate[0]?.id ?? null
  const effectivePrimaryId = primaryId ?? defaultPrimaryId
  const primary = fotos.find((m) => m.id === effectivePrimaryId) ?? null

  const totalPhotos = fotos.reduce((acc, m) => {
    const items = m.payload.items
    if (Array.isArray(items)) return acc + items.length
    if (m.payload.storageKey) return acc + 1
    return acc
  }, 0)

  async function handleMerge() {
    if (!effectivePrimaryId || !primary) return
    const otherIds = fotos.map((m) => m.id).filter((id) => id !== effectivePrimaryId)
    if (otherIds.length === 0) return

    // EE-followup: snapshot del payload + note + capturedAt del primary
    // ANTES del POST. Lo guardamos en una closure para el handler
    // "deshacer" del toast — si el usuario quiere revertir, el cliente
    // sabe a qué shape volver.
    const originalPayload: MomentoPayload = { ...primary.payload }
    const originalNote = primary.note ?? null
    const originalCapturedAt = primary.capturedAt

    try {
      const result = await mergeMutation.mutateAsync({
        primaryId: effectivePrimaryId,
        otherIds,
        ...(newNote.trim() ? { note: newNote.trim() } : {}),
        ...(newCapturedAt ? { capturedAt: newCapturedAt } : {}),
      })

      // EE-followup: toast con "deshacer". El undo:
      //   1. PATCH primary con el payload+note+capturedAt original
      //   2. Restaurar cada other via /api/momentos-restore
      //   3. Invalidar la query infinite para re-fetchear
      // Si alguno falla individualmente, el resto sigue — best-effort.
      const deletedOthers = result.deletedOthers ?? []
      toast.show({
        message: `${otherIds.length + 1} momentos fusionados`,
        tone: 'success',
        action: {
          label: 'Deshacer',
          onAction: async () => {
            try {
              // 1. revertir primary
              await api.updateMomento(effectivePrimaryId, {
                payload: originalPayload,
                note: originalNote,
                capturedAt: originalCapturedAt,
              })
              // 2. restaurar others. Secuencial para no spamear DB.
              for (const o of deletedOthers) {
                try {
                  await api.restoreMomento(o.id, o.deletedAt)
                } catch {
                  // Si falla uno, seguimos con el resto. Mejor restaurar
                  // parcialmente que perder todo por un transient.
                }
              }
              await queryClient.invalidateQueries({
                queryKey: queryKeys.momentosInfinite,
              })
              toast.show({ message: 'Fusión deshecha', tone: 'success' })
            } catch (err) {
              toast.show({
                message:
                  err instanceof Error
                    ? `No se pudo deshacer: ${err.message}`
                    : 'No se pudo deshacer',
                tone: 'error',
              })
            }
          },
        },
      })

      // Reset + cerrar.
      setShowOptions(false)
      setConfirming(false)
      setNewNote('')
      setNewCapturedAt('')
      setPrimaryId(null)
      onMerged()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo fusionar',
        tone: 'error',
      })
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Acciones de fusión"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[calc(100%-2rem)] animate-fade-up"
    >
      <div
        className="rounded-xl border border-ink-100/80 shadow-xl shadow-ink-900/15 overflow-hidden"
        style={{ backgroundColor: 'rgb(var(--paper-50))' }}
      >
        {/* EE-followup: paso de confirmación inline antes del merge.
            En vez de un modal aparte, sustituimos el header de la barra
            con una versión "están seguro" cuando confirming=true. Es la
            misma estructura visual, sólo cambian copy + botones. */}
        {confirming ? (
          <div
            className="px-4 py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3"
            style={{ backgroundColor: 'var(--accent-gold-soft)' }}
            role="alertdialog"
            aria-label="Confirmar fusión"
          >
            <p className="text-sm text-ink-700 min-w-0">
              Vas a fusionar <strong className="tabular-nums">{fotos.length}</strong>{' '}
              momentos en uno. Los otros{' '}
              <strong className="tabular-nums">{fotos.length - 1}</strong> quedarán
              archivados (puedes deshacer desde el toast).
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={mergeMutation.isPending}
                className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-60"
              >
                atrás
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={mergeMutation.isPending}
                className="btn-accent"
                autoFocus
              >
                {mergeMutation.isPending ? 'fusionando…' : 'confirmar fusión'}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-ink-100/40">
            <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 min-w-0">
              <span className="text-sm text-ink-700 font-medium tabular-nums">
                {selected.length}{' '}
                {selected.length === 1 ? 'seleccionado' : 'seleccionados'}
              </span>
              {totalPhotos > 0 && (
                <span className="section-eyebrow">
                  {totalPhotos} {totalPhotos === 1 ? 'foto en total' : 'fotos en total'}
                </span>
              )}
              {hasNonFoto && (
                <span className="text-micro text-ink-400 italic">
                  solo se fusionan fotos
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClear}
                className="section-eyebrow hover:text-ink-700 transition-colors"
              >
                cancelar
              </button>
              {fotos.length >= 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowOptions((s) => !s)}
                    className="section-eyebrow hover:text-ink-700 transition-colors"
                    aria-expanded={showOptions}
                  >
                    {showOptions ? 'menos' : 'opciones'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={mergeMutation.isPending || !effectivePrimaryId}
                    className="btn-accent"
                  >
                    fusionar ({fotos.length})
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Panel expandible con opciones del merge — solo visible
            cuando NO estamos en estado confirming, para no agregar
            ruido al diálogo de confirmación. */}
        {showOptions && !confirming && fotos.length >= 2 && (
          <div className="px-4 py-3 space-y-3 bg-paper-100/40">
            <div>
              <label htmlFor={primarySelectId} className="block section-eyebrow mb-1">
                Cuál sobrevive (primary)
              </label>
              <select
                id={primarySelectId}
                value={effectivePrimaryId ?? ''}
                onChange={(e) => setPrimaryId(e.target.value)}
                className="input-paper w-full text-sm"
              >
                {sortedByDate.map((m, idx) => {
                  const itemCount = Array.isArray(m.payload.items)
                    ? m.payload.items.length
                    : m.payload.storageKey
                      ? 1
                      : 0
                  const dateShort = m.capturedAt.slice(0, 10)
                  const noteShort = m.note
                    ? ` — ${m.note.slice(0, 40)}${m.note.length > 40 ? '…' : ''}`
                    : ''
                  return (
                    <option key={m.id} value={m.id}>
                      {dateShort} · {itemCount} {itemCount === 1 ? 'foto' : 'fotos'}
                      {noteShort}
                      {idx === 0 ? ' (más viejo)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={noteInputId} className="block section-eyebrow mb-1">
                  Título / nota (opcional)
                </label>
                <input
                  id={noteInputId}
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Sobrescribe la nota del primary"
                  className="input-paper w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor={capturedAtInputId} className="block section-eyebrow mb-1">
                  Fecha del evento (opcional)
                </label>
                <input
                  id={capturedAtInputId}
                  type="date"
                  value={newCapturedAt.slice(0, 10)}
                  onChange={(e) =>
                    setNewCapturedAt(e.target.value ? `${e.target.value}T12:00:00Z` : '')
                  }
                  className="input-paper w-full text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
