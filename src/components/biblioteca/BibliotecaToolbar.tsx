import { GalleryIcon, ListIcon } from '../Icons'
import { Tooltip } from '../Tooltip'
import type { LibraryFileType, LibrarySource } from '../../types/biblioteca'
import { FilterPopover } from './FilterPopover'
import type { BibliotecaVista } from './helpers'

/**
 * Barra de controles a la derecha de las pestañas: el popover de filtros, un
 * separador vertical fino y el conmutador de vista (lista / cuadrícula). El
 * botón activo lleva un relleno suave (`bg-ink-50`); ambos exponen
 * `aria-pressed` y un tooltip editorial.
 *
 * Presentacional: recibe el estado (vista + filtros) y emite callbacks; el
 * orquestador lo posee y lo espeja en la URL.
 */
export function BibliotecaToolbar({
  vista,
  onChangeVista,
  tipo,
  fuente,
  onChangeTipo,
  onChangeFuente,
}: {
  vista: BibliotecaVista
  onChangeVista: (next: BibliotecaVista) => void
  tipo: LibraryFileType | ''
  fuente: LibrarySource | ''
  onChangeTipo: (next: LibraryFileType | '') => void
  onChangeFuente: (next: LibrarySource | '') => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FilterPopover
        tipo={tipo}
        fuente={fuente}
        onChangeTipo={onChangeTipo}
        onChangeFuente={onChangeFuente}
      />

      <span aria-hidden className="h-5 w-px bg-ink-100" />

      <div className="flex items-center gap-0.5" role="group" aria-label="Modo de vista">
        <Tooltip content="Lista">
          <button
            type="button"
            aria-label="Lista"
            aria-pressed={vista === 'lista'}
            onClick={() => onChangeVista('lista')}
            className={`inline-flex items-center justify-center size-8 rounded-md transition-colors ${
              vista === 'lista'
                ? 'text-ink-700 bg-ink-50'
                : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'
            }`}
          >
            <ListIcon size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Cuadrícula">
          <button
            type="button"
            aria-label="Cuadrícula"
            aria-pressed={vista === 'cuadricula'}
            onClick={() => onChangeVista('cuadricula')}
            className={`inline-flex items-center justify-center size-8 rounded-md transition-colors ${
              vista === 'cuadricula'
                ? 'text-ink-700 bg-ink-50'
                : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'
            }`}
          >
            <GalleryIcon size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
