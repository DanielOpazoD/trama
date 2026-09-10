import {
  isSavedTemplate,
  type SavedDoc,
} from '../../../../lib/pdfStudio/render/persistence'
import type { NotasSection } from '../../../../types/notas'
import { Button } from '../../../Button'
import { EmptyAction } from '../../../EmptyMessage'

/** Las secciones de Notas desde las que algo puede llegar a Imprenta. */
export type PdfStudioPathSection = Extract<
  NotasSection,
  'biblioteca' | 'notas' | 'planillas'
>

// Los caminos secundarios hablan bajo: la zona de arrastre sigue siendo la
// acción principal, y cuatro botones de tinta competirían con ella.
const QUIET = 'min-h-[44px] px-3'

/**
 * Los caminos que ya llegan a Imprenta, dichos donde hacen falta: en el vacío.
 *
 * La zona de arrastre enseñaba un solo gesto —traer un archivo— mientras los
 * PDF guardados, la Biblioteca, las notas y las planillas quedaban a un clic
 * sin que nada lo dijera. Aquí se ofrecen como acciones reales:
 *   - retomar el último PDF guardado, contado con el mismo filtro que el panel,
 *     y reabrir el panel si el usuario lo plegó (con guardados se abre solo);
 *   - ir a las secciones que envían a Imprenta, y nombrar la de Momentos, que
 *     vive en el otro mundo, con su rótulo real.
 * En Planillas el camino es otro: una planilla guardada, en el panel.
 *
 * Va como HERMANO de la zona de arrastre, no dentro: la zona entera es un
 * `<button>`, y un botón dentro de otro es HTML inválido.
 */
export function PdfStudioEmptyPaths({
  mode,
  saved,
  onOpenSaved,
  onShowSaved,
  onGoToSection,
}: {
  mode: 'editor' | 'templates'
  saved: SavedDoc[]
  onOpenSaved: (saved: SavedDoc) => void
  /** Solo con el panel plegado: con guardados se abre solo, y ofrecerlo sobraría. */
  onShowSaved?: () => void
  onGoToSection?: (section: PdfStudioPathSection) => void
}) {
  const templates = saved.filter(isSavedTemplate)
  if (mode === 'templates') {
    if (templates.length === 0 || !onShowSaved) return null
    return (
      <div className="mt-6 flex justify-center">
        <EmptyAction onClick={onShowSaved}>
          {templates.length === 1
            ? 'Ver tu planilla guardada'
            : `Ver tus ${templates.length} planillas guardadas`}
        </EmptyAction>
      </div>
    )
  }

  const creations = saved.filter((s) => !isSavedTemplate(s))
  const latest = creations.reduce<SavedDoc | null>(
    (best, s) => (best === null || s.savedAt > best.savedAt ? s : best),
    null,
  )
  return (
    <div
      role="group"
      aria-label="Otros caminos a Imprenta"
      className="mx-auto mt-6 max-w-3xl text-center"
    >
      {latest && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <EmptyAction
            className="max-w-full truncate"
            onClick={() => onOpenSaved(latest)}
          >
            Retomar «{latest.name}»
          </EmptyAction>
          {onShowSaved && creations.length > 1 && (
            <Button variant="quiet" className={QUIET} onClick={onShowSaved}>
              Ver los {creations.length} guardados
            </Button>
          )}
        </div>
      )}
      {onGoToSection && (
        <>
          <p className="mt-5 font-serif text-body italic text-ink-400">
            o trae algo que ya tienes
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-x-4">
            <Button
              variant="quiet"
              className={QUIET}
              onClick={() => onGoToSection('biblioteca')}
            >
              Desde la Biblioteca
            </Button>
            <Button
              variant="quiet"
              className={QUIET}
              onClick={() => onGoToSection('notas')}
            >
              Desde tus notas y capturas
            </Button>
            <Button
              variant="quiet"
              className={QUIET}
              onClick={() => onGoToSection('planillas')}
            >
              {templates.length > 0 ? 'Rellenar una planilla' : 'Crear una planilla'}
            </Button>
          </div>
        </>
      )}
      <p className="mt-2 text-caption text-ink-400">
        En Momentos, «Fotos a Imprenta» trae las fotos de una entrada.
      </p>
    </div>
  )
}
