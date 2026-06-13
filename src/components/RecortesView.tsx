import { useMemo, useState } from 'react'
import { useDeleteRecorte, useRecortesQuery, useUpdateRecorte } from '../state'
import { type Recorte, type RecorteTarget } from '../api'
import { ViewHeader } from './ViewHeader'
import { EmptyMessage } from './EmptyMessage'
import { LoadingHint } from './LoadingHint'
import { EndMark, ScissorsIcon } from './Icons'
import { RecorteCard } from './recortes/RecorteCard'
import { PromoteModal, type PromoteSeed } from './recortes/PromoteModal'
import {
  RecortesFilterChips,
  type RecortesFilter as Filter,
} from './recortes/RecortesFilterChips'

/**
 * Recortes — la bandeja de entrada de capturas web. Lo que la extensión
 * de Chrome guarda aterriza acá como 'pending'; nada entra al grafo solo.
 * Cada recorte es una tarjeta tipo recorte de prensa, y desde ella se
 * promueve a Cita / Entidad / Momento (con revisión y edición previa),
 * se archiva o se elimina (con deshacer).
 */

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
    seed?: PromoteSeed
  } | null>(null)

  const counts = useMemo(() => {
    const c = { pending: 0, archived: 0, promoted: 0 }
    for (const r of recortes) c[r.status] += 1
    return c
  }, [recortes])
  const visible = recortes.filter((r) => r.status === filter)

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

      <RecortesFilterChips filter={filter} counts={counts} onChangeFilter={setFilter} />

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
          {visible.map((r) => (
            <RecorteCard
              key={r.id}
              recorte={r}
              onPromote={(recorte, target, seed) =>
                setPromoting({ recorte, target, seed })
              }
              onArchive={() =>
                updateRecorte.mutate({ id: r.id, patch: { status: 'archived' } })
              }
              onRestore={() =>
                updateRecorte.mutate({ id: r.id, patch: { status: 'pending' } })
              }
              onDelete={() => deleteRecorte.mutate(r.id)}
            />
          ))}
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
          seed={promoting.seed}
          onClose={() => setPromoting(null)}
        />
      )}
    </>
  )
}
