import { useState } from 'react'
import RecortesView from './RecortesView'
import { FavoritosPanel } from './recortes/FavoritosPanel'

/**
 * Área de Recortes con dos pestañas hermanas: la bandeja de captura (Recortes)
 * y los marcadores de página (Favoritos). El toggle vive acá para no engordar
 * RecortesView; cada panel conserva su propio encabezado.
 */
type Tab = 'recortes' | 'favoritos'

export default function RecortesArea({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const [tab, setTab] = useState<Tab>('recortes')

  const pill = (value: Tab, label: string) => (
    <button
      key={value}
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
        tab === value
          ? 'bg-ink-800 text-paper-50'
          : 'text-ink-400 hover:bg-ink-100/60 hover:text-ink-700'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="mb-4 flex gap-1.5">
        {pill('recortes', 'Recortes')}
        {pill('favoritos', 'Favoritos')}
      </div>
      {tab === 'recortes' ? (
        <RecortesView onSelectEntity={onSelectEntity} />
      ) : (
        <FavoritosPanel />
      )}
    </>
  )
}
