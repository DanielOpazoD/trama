import { lazy, Suspense, useState } from 'react'
import RecortesView from './RecortesView'
import { FavoritosPanel } from './recortes/FavoritosPanel'
import { LoadingHint } from './LoadingHint'

const KnowledgeWorkflowView = lazy(() =>
  import('./KnowledgeWorkflowView').then((m) => ({ default: m.KnowledgeWorkflowView })),
)

/**
 * Área de Recortes con tres pestañas hermanas: captura, favoritos y mesa
 * editorial. Así el flujo de escribir desde materiales vive cerca de la
 * captura/curaduría sin convertirse en una sección top-level.
 */
type Tab = 'recortes' | 'favoritos' | 'mesa'

/** Deep-link: ?tab=favoritos o ?tab=mesa abren el subcontexto exacto. */
function initialTab(): Tab {
  if (typeof window === 'undefined') return 'recortes'
  const tab = new URLSearchParams(window.location.search).get('tab')
  if (tab === 'favoritos' || tab === 'mesa') return tab
  return 'recortes'
}

export default function RecortesArea({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab)

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
        {pill('mesa', 'Mesa')}
      </div>
      {tab === 'recortes' && <RecortesView onSelectEntity={onSelectEntity} />}
      {tab === 'favoritos' && <FavoritosPanel />}
      {tab === 'mesa' && (
        <Suspense fallback={<LoadingHint text="cargando mesa" />}>
          <KnowledgeWorkflowView />
        </Suspense>
      )}
    </>
  )
}
