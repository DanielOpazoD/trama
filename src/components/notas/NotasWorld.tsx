import { useEffect, useState } from 'react'
import { ClavesView } from './ClavesView'
import { NotasGlobalSearch } from './NotasGlobalSearch'
import { NotasHomeView } from './NotasHomeView'
import { NotasView } from './NotasView'
import { NotasMobileTabs, NotasSidebar, NotasTopBar } from './NotasWorldChrome'
import { PromptsView } from './PromptsView'
import { TareasView } from './TareasView'
import type { World } from '../../types/world'

/**
 * τ-worlds: el mundo "Trama Notas" — un workspace de productividad liviana
 * (apuntes rápidos + tareas), independiente del mapa pero con puentes (p. ej.
 * promover una nota a Momento, en una fase posterior).
 *
 * Arma la sub-barra del mundo y sus secciones funcionales: inicio, notas,
 * tareas, prompts y claves. La búsqueda global se abre desde el chrome (igual
 * que el ⌘K del mundo principal): un acceso en el sidebar/cabecera despliega un
 * overlay, en vez de ocupar una barra fija sobre el contenido.
 */
export type NotasSection = 'inicio' | 'notas' | 'tareas' | 'prompts' | 'claves'

export function NotasWorld({
  world,
  onChangeWorld,
}: {
  world: World
  onChangeWorld: (w: World) => void
}) {
  const [section, setSection] = useState<NotasSection>('inicio')
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (!searchOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen])

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden">
      <NotasSidebar
        world={world}
        section={section}
        onChangeWorld={onChangeWorld}
        onChangeSection={setSection}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <NotasMobileTabs
        world={world}
        section={section}
        onChangeWorld={onChangeWorld}
        onChangeSection={setSection}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* Contenido */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <NotasTopBar section={section} />
        <div className="h-full overflow-y-auto">
          <div
            data-testid="notas-world-content"
            className="px-5 md:px-8 pb-24 mx-auto py-8 md:py-10 max-w-5xl"
          >
            {section === 'inicio' && <NotasHomeView onNavigate={setSection} />}
            {section === 'notas' && <NotasView />}
            {section === 'tareas' && <TareasView />}
            {section === 'prompts' && <PromptsView />}
            {section === 'claves' && <ClavesView />}
          </div>
        </div>
      </main>

      {/* Buscador global — overlay abierto desde el chrome. */}
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buscar en Notas"
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-ink-900/20 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-3 animate-fade-up"
          >
            <NotasGlobalSearch
              autoFocus
              onNavigate={(s) => {
                setSection(s)
                setSearchOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
