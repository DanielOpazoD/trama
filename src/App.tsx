import { useState } from 'react'
import { StateProvider, useTrama } from './state'
import { EntitiesView } from './components/EntitiesView'
import { QuotesView } from './components/QuotesView'
import { RelationshipsView } from './components/RelationshipsView'

type Tab = 'entidades' | 'citas' | 'relaciones'

const TABS: { value: Tab; label: string }[] = [
  { value: 'entidades', label: 'entidades' },
  { value: 'citas', label: 'citas' },
  { value: 'relaciones', label: 'relaciones' },
]

function Shell() {
  const { loading, error, offline } = useTrama()
  const [tab, setTab] = useState<Tab>('entidades')

  return (
    <div className="min-h-screen px-6 py-12 md:px-12 md:py-16 max-w-3xl mx-auto">
      <header className="mb-10">
        <div className="flex items-baseline gap-4">
          <h1 className="text-5xl md:text-6xl tracking-tight text-stone-800">Trama</h1>
          {offline && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-100">
              modo local
            </span>
          )}
        </div>
        <p className="mt-2 text-stone-500 italic">mapa de afinidades</p>
      </header>

      <nav className="mb-10 flex gap-8 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`pb-3 text-xs uppercase tracking-[0.2em] transition-colors ${
              tab === t.value
                ? 'text-stone-800 border-b-2 border-stone-800 -mb-px'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-100 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-stone-400 italic">cargando…</p>
      ) : (
        <>
          {tab === 'entidades' && <EntitiesView />}
          {tab === 'citas' && <QuotesView />}
          {tab === 'relaciones' && <RelationshipsView />}
        </>
      )}

      <footer className="mt-24 text-center text-xs uppercase tracking-[0.2em] text-stone-300">
        trama · v0.1.0
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <StateProvider>
      <Shell />
    </StateProvider>
  )
}
