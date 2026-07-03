import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import {
  DownloadIcon,
  DuplicateIcon,
  FilePdfIcon,
  UndoIcon,
  PencilIcon,
  TrashIcon,
} from '../../../Icons'
import { OverflowMenu, OverflowMenuItem } from '../../../OverflowMenu'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

/** Menú de acciones del card de plantilla. Presentacional: cierra y delega. */
export function WorkspaceTemplateCardMenu({
  saved,
  onDelete,
  onDuplicate,
  onDuplicateAndEdit,
  onDownloadPdf,
  onEditDetails,
  onExportCsv,
  onExportJson,
  onShowVersions,
  onStartRename,
}: {
  saved: SavedDoc
  onDelete: () => void
  onDuplicate: () => void
  onDuplicateAndEdit: () => void
  onDownloadPdf: () => void
  onEditDetails: () => void
  onExportCsv: () => void
  onExportJson: () => void
  /** Historial en la nube; ausente si la plantilla no está sincronizada. */
  onShowVersions?: () => void
  onStartRename: () => void
}) {
  const item = (close: () => void, action: () => void) => () => {
    close()
    action()
  }
  return (
    <OverflowMenu
      label={`Más acciones de ${saved.name}`}
      width="w-56"
      triggerClassName={rowBtn}
    >
      {(close) => (
        <>
          <OverflowMenuItem onClick={item(close, onDuplicate)}>
            <DuplicateIcon size={14} />
            Duplicar
          </OverflowMenuItem>
          <OverflowMenuItem onClick={item(close, onDuplicateAndEdit)}>
            <DuplicateIcon size={14} />
            Duplicar y editar copia
          </OverflowMenuItem>
          <OverflowMenuItem onClick={item(close, onStartRename)}>
            <PencilIcon size={14} />
            Renombrar
          </OverflowMenuItem>
          {onShowVersions ? (
            <OverflowMenuItem onClick={item(close, onShowVersions)}>
              <UndoIcon size={14} />
              Versiones…
            </OverflowMenuItem>
          ) : null}
          <OverflowMenuItem onClick={item(close, onEditDetails)}>
            <PencilIcon size={14} />
            Editar detalles
          </OverflowMenuItem>
          <div className="my-1 border-t border-ink-100" />
          <OverflowMenuItem onClick={item(close, onDownloadPdf)}>
            <FilePdfIcon size={14} />
            Descargar PDF editable
          </OverflowMenuItem>
          <OverflowMenuItem onClick={item(close, onExportJson)}>
            <DownloadIcon size={14} />
            Exportar JSON
          </OverflowMenuItem>
          <OverflowMenuItem onClick={item(close, onExportCsv)}>
            <DownloadIcon size={14} />
            Exportar CSV
          </OverflowMenuItem>
          <div className="my-1 border-t border-ink-100" />
          <OverflowMenuItem danger onClick={item(close, onDelete)}>
            <TrashIcon size={14} />
            Eliminar
          </OverflowMenuItem>
        </>
      )}
    </OverflowMenu>
  )
}
