import { useState } from 'react'
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
 * tareas, prompts y claves.
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

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden">
      <NotasSidebar
        world={world}
        section={section}
        onChangeWorld={onChangeWorld}
        onChangeSection={setSection}
      />

      <NotasMobileTabs
        world={world}
        section={section}
        onChangeWorld={onChangeWorld}
        onChangeSection={setSection}
      />

      {/* Contenido */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <NotasTopBar section={section} />
        <div className="h-full overflow-y-auto">
          <div
            data-testid="notas-world-content"
            className="px-5 md:px-8 pb-24 mx-auto py-8 md:py-10 max-w-5xl"
          >
            <NotasGlobalSearch onNavigate={setSection} />
            {section === 'inicio' && <NotasHomeView onNavigate={setSection} />}
            {section === 'notas' && <NotasView />}
            {section === 'tareas' && <TareasView />}
            {section === 'prompts' && <PromptsView />}
            {section === 'claves' && <ClavesView />}
          </div>
        </div>
      </main>
    </div>
  )
}
