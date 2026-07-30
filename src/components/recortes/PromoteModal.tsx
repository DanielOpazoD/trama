import { useEffect, useRef, useState } from 'react'
import { usePromoteRecorte } from '../../state'
import { useToast } from '../../state/toast'
import { ENTITY_TYPES } from '../../types'
import type { Entity } from '../../types'
import type { Recorte, RecorteTarget } from '../../api'
import { CloseIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { EntityCombobox } from '../EntityCombobox'

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

/** Pies de foto autogenerados que NO vale la pena arrastrar como caption. */
const IMAGE_PLACEHOLDERS = new Set([
  '📷 imagen desde whatsapp',
  'imagen guardada',
  'recorte visual de la página',
])

/** Caption limpio para un momento foto: el texto del recorte salvo que sea un
 *  pie autogenerado (en ese caso, sin caption). */
function captionFromText(text: string): string | undefined {
  const t = text.trim()
  if (!t || IMAGE_PLACEHOLDERS.has(t.toLowerCase())) return undefined
  return t
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
  const promote = usePromoteRecorte()
  const toast = useToast()
  const [text, setText] = useState(recorte.text)
  const [entityId, setEntityId] = useState<string>(seed?.entityId ?? '')
  const [selectedEntityName, setSelectedEntityName] = useState(seed?.entityName ?? '')
  const [entityName, setEntityName] = useState(
    seed?.entityName ?? recorte.sourceAuthor ?? recorte.sourceTitle ?? '',
  )
  const [entityType, setEntityType] = useState(seed?.entityType ?? 'concepto')
  const [source, setSource] = useState(
    [recorte.sourceTitle, recorte.sourceAuthor].filter(Boolean).join(' · '),
  )
  const [busy, setBusy] = useState(false)
  // Una captura con imagen propia se promueve a un Momento FOTO (no a un
  // momento de texto): el servidor copia el blob y la imagen aparece en el
  // álbum. El resto sigue siendo un momento «recorte» de texto/enlace.
  const isImageCaptura = !!recorte.imageKey
  const textRef = useRef<HTMLTextAreaElement>(null)
  // Modal auto-gestionado: el overlay aporta focus-trap, scroll-lock y Escape
  // (consciente del stack). Mientras promueve (busy) no se puede cerrar con
  // Escape, igual que el backdrop y los botones quedan deshabilitados.
  const overlay = useModalOverlay({ open: true, onClose, closeOnEscape: !busy })

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  function handleQuoteEntityChange(entity: Entity | null) {
    setEntityId(entity?.id ?? '')
    setSelectedEntityName(entity?.name ?? '')
  }

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      if (target === 'quote') {
        if (!entityId) {
          toast.show({ message: 'Elige a quién atribuir la cita', tone: 'error' })
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
      } else if (isImageCaptura) {
        // Captura con imagen → Momento FOTO. El servidor copia el blob de
        // recortes-media a momentos-media y arma el payload con su storageKey;
        // acá solo mandamos el pie (caption). El texto editado es el caption.
        await promote.mutateAsync({
          id: recorte.id,
          input: {
            target: 'momento',
            momento: {
              kind: 'foto',
              payload: {
                caption: captionFromText(text),
              },
              note: recorte.note,
              capturedAt: recorte.capturedAt ?? recorte.createdAt,
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

  // Una foto del día puede ir sin pie: no exigimos texto cuando es una captura
  // de imagen promovida a momento. El resto sí requiere texto.
  const requiresText = !(target === 'momento' && isImageCaptura)
  const confirmDisabled =
    busy ||
    (requiresText && text.trim().length === 0) ||
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
        ref={overlay.dialogRef}
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
              {target === 'momento' &&
                (isImageCaptura ? 'Como foto del día' : 'Como momento del día')}
            </h2>
          </div>
          <IconButton
            onClick={onClose}
            disabled={busy}
            label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          >
            <CloseIcon />
          </IconButton>
        </header>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <label htmlFor="promote-text" className="block text-caption text-ink-700">
            {target === 'momento' && isImageCaptura ? 'Pie de foto (opcional)' : 'Texto'}
            <textarea
              id="promote-text"
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={5}
              className="input-paper mt-1 block w-full resize-none rounded-md border border-ink-200 px-2.5 py-2 font-serif text-body leading-relaxed"
            />
          </label>

          {target === 'quote' && (
            <>
              <label className="block text-caption text-ink-700">
                Atribuida a
                <div className="mt-1">
                  <EntityCombobox
                    value={entityId || null}
                    onChange={handleQuoteEntityChange}
                    selectedName={selectedEntityName || null}
                    placeholder="buscar entidad…"
                  />
                </div>
              </label>
              <label htmlFor="promote-source" className="block text-caption text-ink-700">
                Fuente
                <input
                  id="promote-source"
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
              <label htmlFor="promote-name" className="block text-caption text-ink-700">
                Nombre
                <input
                  id="promote-name"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  disabled={busy}
                  className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2.5 font-serif text-sm"
                />
              </label>
              <label htmlFor="promote-type" className="block text-caption text-ink-700">
                Tipo
                <select
                  id="promote-type"
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
              {isImageCaptura
                ? 'Se crea una foto del día con la imagen de la captura; aparecerá en el álbum de Momentos.'
                : 'Se crea un momento «recorte» con la fuente y la fecha de captura.'}
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
