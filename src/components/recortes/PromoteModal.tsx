import { useEffect, useMemo, useRef, useState } from 'react'
import { useEntitiesQuery, usePromoteRecorte } from '../../state'
import { useToast } from '../../state/toast'
import { ENTITY_TYPES } from '../../types'
import type { Recorte, RecorteTarget } from '../../api'
import { CloseIcon } from '../Icons'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export type PromoteSeed = {
  title?: string
  entityId?: string
  entityName?: string
  entityType?: string
}

const TARGET_LABEL: Record<RecorteTarget, string> = {
  quote: 'cita',
  entity: 'entidad',
  momento: 'momento',
}

/** Modal de promoción: revisar y editar ANTES de crear el objeto destino. */
export function PromoteModal({
  recorte,
  target,
  seed,
  onClose,
}: {
  recorte: Recorte
  target: RecorteTarget
  seed?: PromoteSeed
  onClose: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const promote = usePromoteRecorte()
  const toast = useToast()
  const [text, setText] = useState(recorte.text)
  const [entityId, setEntityId] = useState<string>(seed?.entityId ?? '')
  const [entityName, setEntityName] = useState(
    seed?.entityName ?? recorte.sourceAuthor ?? recorte.sourceTitle ?? '',
  )
  const [entityType, setEntityType] = useState(seed?.entityType ?? 'concepto')
  const [source, setSource] = useState(
    [recorte.sourceTitle, recorte.sourceAuthor].filter(Boolean).join(' · '),
  )
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  useFocusTrap(dialogRef, true)

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  const sortedEntities = useMemo(
    () => [...entities].sort((a, b) => a.name.localeCompare(b.name)),
    [entities],
  )

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      if (target === 'quote') {
        if (!entityId) {
          toast.show({ message: 'Elegí a quién atribuir la cita', tone: 'error' })
          setBusy(false)
          return
        }
        await promote.mutateAsync({
          id: recorte.id,
          input: {
            target: 'quote',
            quote: {
              entityId,
              text: text.trim(),
              source: source.trim() || null,
              link: recorte.sourceUrl,
            },
          },
        })
      } else if (target === 'entity') {
        await promote.mutateAsync({
          id: recorte.id,
          input: {
            target: 'entity',
            entity: {
              type: entityType,
              name: entityName.trim(),
              description: text.trim().slice(0, 280) || null,
            },
          },
        })
      } else {
        await promote.mutateAsync({
          id: recorte.id,
          input: {
            target: 'momento',
            momento: {
              kind: 'recorte',
              payload: {
                bodyText: text.trim(),
                url: recorte.sourceUrl ?? undefined,
                title: recorte.sourceTitle ?? undefined,
                author: recorte.sourceAuthor ?? undefined,
              },
              note: recorte.note,
              capturedAt: recorte.capturedAt ?? recorte.createdAt,
            },
          },
        })
      }
      toast.show({
        message: `Recorte promovido a ${TARGET_LABEL[target]}`,
        tone: 'success',
      })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo promover'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const confirmDisabled =
    busy ||
    text.trim().length === 0 ||
    (target === 'quote' && !entityId) ||
    (target === 'entity' && entityName.trim().length === 0)

  return (
    <>
      <button
        onClick={() => !busy && onClose()}
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm cursor-default"
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Promover a ${TARGET_LABEL[target]}`}
        className="fixed inset-x-4 top-16 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] z-50 flex flex-col rounded-xl border border-ink-100/50 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 overflow-hidden animate-slide-up"
      >
        <header className="px-5 py-4 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300">
              promover recorte
            </p>
            <h2 className="font-serif text-lg text-ink-700 mt-0.5">
              {target === 'quote' && 'Como cita del archivo'}
              {target === 'entity' && 'Como entidad de la trama'}
              {target === 'momento' && 'Como momento del día'}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <label className="block text-caption text-ink-700">
            Texto
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={5}
              className="input-paper mt-1 block w-full resize-none rounded-md border border-ink-200 px-2.5 py-2 font-serif text-sm leading-relaxed"
            />
          </label>

          {target === 'quote' && (
            <>
              <label className="block text-caption text-ink-700">
                Atribuida a
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  disabled={busy}
                  className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2 text-sm"
                >
                  <option value="">elegir entidad…</option>
                  {sortedEntities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.type})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-caption text-ink-700">
                Fuente
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={busy}
                  className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2.5 text-sm"
                />
              </label>
            </>
          )}

          {target === 'entity' && (
            <>
              <label className="block text-caption text-ink-700">
                Nombre
                <input
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  disabled={busy}
                  className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2.5 font-serif text-sm"
                />
              </label>
              <label className="block text-caption text-ink-700">
                Tipo
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  disabled={busy}
                  className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2 text-sm"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-micro text-ink-400 leading-relaxed">
                El texto del recorte queda como descripción (recortado a 280).
              </p>
            </>
          )}

          {target === 'momento' && (
            <p className="text-micro text-ink-400 leading-relaxed">
              Se crea un momento «recorte» con la fuente y la fecha de captura.
            </p>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-ink-100/60 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
          >
            cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="btn-accent text-xs"
          >
            {busy ? 'promoviendo…' : `crear ${TARGET_LABEL[target]}`}
          </button>
        </footer>
      </div>
    </>
  )
}
