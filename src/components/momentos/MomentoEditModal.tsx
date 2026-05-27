import type { Momento } from '../../types'
import { NotaEditModal } from './editModal/NotaEditModal'
import { RecorteEditModal } from './editModal/RecorteEditModal'
import { FotoEditModal } from './editModal/FotoEditModal'

/**
 * Dispatcher de edición de Momentos. Cada kind tiene su propio modal
 * con shape de payload y campos editables distintos:
 *
 *   - nota    → bodyText (textarea serif)
 *   - recorte → url, title, body, source, author, note
 *   - foto    → items[], caption, note (con upload + reorder)
 *
 * Todos comparten ModalShell + CapturedAtField + ModalFooter desde
 * ./editModal/shell.tsx, así la edición de fecha y la estructura de
 * overlay quedan consistentes entre los tres.
 *
 * El archivo era monolítico (~750 LOC) antes de splittearse en este
 * dispatcher + 3 sub-modales + shell compartido. Si necesitás tocar el
 * comportamiento de UN kind, vas directo a su archivo.
 */
export function MomentoEditModal({
  momento,
  open,
  onClose,
}: {
  momento: Momento
  open: boolean
  onClose: () => void
}) {
  if (!open) return null
  if (momento.kind === 'nota') {
    return <NotaEditModal momento={momento} onClose={onClose} />
  }
  if (momento.kind === 'recorte') {
    return <RecorteEditModal momento={momento} onClose={onClose} />
  }
  return <FotoEditModal momento={momento} onClose={onClose} />
}
