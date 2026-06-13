import { EntitiesView } from './EntitiesView'
import { RelationshipsView } from './RelationshipsView'
import type { ExtractionProposal } from '../types'
import { EditorialProjectsContextStrip } from './editorial/EditorialProjectsContextStrip'

/**
 * ο1 + ρ-struct: Wrapper de Entidades.
 *
 * Antes tenía un header con h2 + descripción + tabs propias. Las tabs
 * se promovieron al TopBar (ρ-struct) para que naveguen sin importar
 * el scroll y dejen el cuerpo de la vista al contenido editorial. Cada
 * sub-vista (Listado / Vínculos) tiene ahora su propio header con
 * acciones al lado del título.
 *
 * El tab activo se controla desde App.tsx — esto permite a TopBar
 * exponerlo como tabs contextuales y a CommandPalette deep-linkear a
 * una de las dos vistas.
 */
export function EntitiesWorkbench({
  tab,
  onTabChange: _onTabChange,
  onSelectEntity,
  onProposal,
}: {
  tab: 'listado' | 'vinculos'
  onTabChange: (tab: 'listado' | 'vinculos') => void
  onSelectEntity?: (id: string) => void
  onProposal?: (text: string, proposal: ExtractionProposal) => void
}) {
  // onTabChange se acepta para que App pueda escuchar (al hacer deep-link
  // desde el palette podríamos forzar 'vinculos'). Hoy no lo usamos
  // internamente porque las tabs viven arriba en TopBar.
  void _onTabChange
  return (
    <>
      <EditorialProjectsContextStrip className="mb-6" />
      {tab === 'listado' && <EntitiesView onSelectEntity={onSelectEntity} />}
      {tab === 'vinculos' && (
        <RelationshipsView onSelectEntity={onSelectEntity} onProposal={onProposal} />
      )}
    </>
  )
}
