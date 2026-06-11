import { useMemo, useState } from 'react'
import {
  useDeleteRecorte,
  useEntitiesQuery,
  usePromoteRecorte,
  useRecortesQuery,
  useUpdateRecorte,
} from '../state'
import { useToast } from '../state/toast'
import { api, type Recorte, type RecorteTarget } from '../api'
import { ENTITY_TYPES } from '../types'
import { ViewHeader } from './ViewHeader'
import { EmptyMessage } from './EmptyMessage'
import { LoadingHint } from './LoadingHint'
import { CloseIcon, EndMark, ScissorsIcon } from './Icons'

/**
 * Recortes — la bandeja de entrada de capturas web. Lo que la extensión
 * de Chrome guarda aterriza acá como 'pending'; nada entra al grafo solo.
 * Cada recorte es una tarjeta tipo recorte de prensa, y desde ella se
 * promueve a Cita / Entidad / Momento (con revisión y edición previa),
 * se archiva o se elimina (con deshacer).
 */

function formatStamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d
    .toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/\./g, '')
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

type Filter = 'pending' | 'archived' | 'promoted'

const TARGET_LABEL: Record<RecorteTarget, string> = {
  quote: 'cita',
  entity: 'entidad',
  momento: 'momento',
}

/** Modal de promoción: revisar y editar ANTES de crear el objeto destino. */
function PromoteModal({
  recorte,
  target,
  onClose,
}: {
  recorte: Recorte
  target: RecorteTarget
  onClose: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const promote = usePromoteRecorte()
  const toast = useToast()
  const [text, setText] = useState(recorte.text)
  const [entityId, setEntityId] = useState<string>('')
  const [entityName, setEntityName] = useState(
    recorte.sourceAuthor ?? recorte.sourceTitle ?? '',
  )
  const [entityType, setEntityType] = useState('concepto')
  const [source, setSource] = useState(
    [recorte.sourceTitle, recorte.sourceAuthor].filter(Boolean).join(' · '),
  )
  const [busy, setBusy] = useState(false)

  const sortedEntities = useMemo(
    () => [...entities].sort((a, b) => a.name.localeCompare(b.name)),
    [entities],
  )

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      let promotedId: string
      if (target === 'quote') {
        if (!entityId) {
          toast.show({ message: 'Elegí a quién atribuir la cita', tone: 'error' })
          setBusy(false)
          return
        }
        const created = await api.createQuote({
          entityId,
          text: text.trim(),
          source: source.trim() || undefined,
          link: recorte.sourceUrl ?? undefined,
          origin: { kind: 'manual' },
        })
        promotedId = created.id
      } else if (target === 'entity') {
        const created = await api.createEntity({
          type: entityType,
          name: entityName.trim(),
          description: text.trim().slice(0, 280) || undefined,
          origin: { kind: 'manual' },
        })
        promotedId = created.id
      } else {
        const created = await api.createMomento({
          kind: 'recorte',
          payload: {
            bodyText: text.trim(),
            url: recorte.sourceUrl ?? undefined,
            title: recorte.sourceTitle ?? undefined,
            author: recorte.sourceAuthor ?? undefined,
          },
          note: recorte.note,
          capturedAt: recorte.capturedAt ?? recorte.createdAt,
        })
        promotedId = created.id
      }
      await promote.mutateAsync({ id: recorte.id, target, promotedId })
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
        role="dialog"
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

export default function RecortesView({
  onSelectEntity: _onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const { data: recortes = [], isLoading } = useRecortesQuery()
  const updateRecorte = useUpdateRecorte()
  const deleteRecorte = useDeleteRecorte()
  const [filter, setFilter] = useState<Filter>('pending')
  const [promoting, setPromoting] = useState<{
    recorte: Recorte
    target: RecorteTarget
  } | null>(null)

  const counts = useMemo(() => {
    const c = { pending: 0, archived: 0, promoted: 0 }
    for (const r of recortes) c[r.status] += 1
    return c
  }, [recortes])
  const visible = recortes.filter((r) => r.status === filter)

  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
        filter === f
          ? 'bg-ink-800 text-paper-50'
          : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100/60'
      }`}
    >
      {label}
      <span className="ml-1 text-micro tabular-nums opacity-70">{counts[f]}</span>
    </button>
  )

  return (
    <>
      <ViewHeader
        title="Recortes"
        icon={<ScissorsIcon size={22} />}
        eyebrow="capturas esperando curaduría"
        accent="var(--accent-gold)"
        spacing="tight"
        subtitle="Lo que guardas desde la web con la extensión de Chrome aterriza aquí. Nada entra a la trama solo: tú decides qué se vuelve cita, entidad o momento."
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {chip('pending', 'pendientes')}
        {chip('archived', 'archivados')}
        {chip('promoted', 'promovidos')}
      </div>

      {isLoading ? (
        <LoadingHint text="cargando" />
      ) : recortes.length === 0 ? (
        <EmptyMessage
          illustration="weave"
          title="La bandeja está esperando su primer recorte."
          body={
            <>
              Instala la extensión de Trama en Chrome, selecciona un texto que te llegue y
              guárdalo con el clic derecho. Aparecerá aquí, con su fuente, listo para
              decidir qué hilo se vuelve.
            </>
          }
          hint="El token de conexión se genera en Configuración → Conectar extensión."
        />
      ) : visible.length === 0 ? (
        <p className="py-8 text-center font-serif italic text-sm text-ink-400">
          Nada{' '}
          {filter === 'pending'
            ? 'pendiente'
            : filter === 'archived'
              ? 'archivado'
              : 'promovido'}{' '}
          por ahora.
        </p>
      ) : (
        <ul className="space-y-4 max-w-3xl">
          {visible.map((r) => {
            const host = hostOf(r.sourceUrl)
            return (
              <li key={r.id} className="group relative card-paper-soft p-4 pt-3">
                {/* Doble filete de prensa — el mismo gesto de los bookmarks de X. */}
                <div aria-hidden className="mb-2.5">
                  <div className="border-t-2 border-ink-700/60" />
                  <div className="mt-0.5 border-t border-ink-200" />
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-serif text-sm font-medium text-ink-700">
                    {r.sourceTitle ?? host ?? 'recorte'}
                    {r.sourceAuthor && (
                      <span className="font-sans font-normal text-ink-400">
                        {' '}
                        — {r.sourceAuthor}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 -rotate-2 rounded-sm border border-ink-200 px-1.5 py-0.5 text-micro uppercase tracking-wider text-ink-400 tabular-nums">
                    {formatStamp(r.capturedAt ?? r.createdAt)}
                  </span>
                </div>

                <p className="mt-1.5 whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700">
                  «{r.text}»
                </p>

                {r.note && <p className="mt-2 marginalia-script">{r.note}</p>}

                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  {r.sourceUrl && (
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      ver original{host ? ` · ${host}` : ''}
                    </a>
                  )}
                  {r.status === 'promoted' && r.promotedTarget && (
                    <span className="text-micro uppercase tracking-eyebrow text-ink-300">
                      → {TARGET_LABEL[r.promotedTarget]}
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {r.status === 'pending' && (
                      <>
                        {(['quote', 'entity', 'momento'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setPromoting({ recorte: r, target: t })}
                            className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
                          >
                            → {TARGET_LABEL[t]}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            updateRecorte.mutate({
                              id: r.id,
                              patch: { status: 'archived' },
                            })
                          }
                          className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
                        >
                          archivar
                        </button>
                      </>
                    )}
                    {r.status === 'archived' && (
                      <button
                        onClick={() =>
                          updateRecorte.mutate({ id: r.id, patch: { status: 'pending' } })
                        }
                        className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
                      >
                        volver a pendientes
                      </button>
                    )}
                    <button
                      onClick={() => deleteRecorte.mutate(r.id)}
                      className="text-micro text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
                    >
                      eliminar
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {recortes.length > 0 && (
        <div className="mt-8 flex justify-center">
          <EndMark />
        </div>
      )}

      {promoting && (
        <PromoteModal
          recorte={promoting.recorte}
          target={promoting.target}
          onClose={() => setPromoting(null)}
        />
      )}
    </>
  )
}
