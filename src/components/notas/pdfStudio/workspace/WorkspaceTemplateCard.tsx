import { useRef, useState } from 'react'
import {
  savedTemplateStatus,
  type SavedDoc,
} from '../../../../lib/pdfStudio/render/persistence'
import { PencilIcon } from '../../../Icons'
import { WorkspaceTemplateCardMenu } from './WorkspaceTemplateCardMenu'
import {
  WorkspaceTemplateDetails,
  WorkspaceTemplateStatusBadge,
  type SavedTemplateMetaPatch,
} from './WorkspaceTemplateDetails'
import { WorkspaceTemplateThumb } from './WorkspaceTemplateThumb'
import {
  templateCloudBadge,
  workspaceTemplateFieldCountLabel,
  workspaceTemplateSavedAtLabel,
} from './workspaceTemplateCardModel'

const CLOUD_DOT_TONES = {
  cloud: 'bg-[color:var(--accent-sage)]',
  pending: 'bg-[color:var(--accent-clay)]/80',
  local: 'bg-ink-300',
} as const

export function WorkspaceTemplateCard({
  saved,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
  onStartRename,
  onUseTemplate,
  onEditStructure,
  onDuplicate,
  onDuplicateAndEdit,
  onUpdateMeta,
  onDelete,
  onDownloadPdf,
  onExportJson,
  onExportCsv,
  onShowVersions,
}: {
  saved: SavedDoc
  renameValue: string | null
  onRenameValueChange: (value: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onStartRename: () => void
  onUseTemplate: () => void
  onEditStructure: () => void
  onDuplicate: () => void
  onDuplicateAndEdit: () => void
  onUpdateMeta: (meta: SavedTemplateMetaPatch) => void
  onDelete: () => void
  onDownloadPdf: () => void
  onExportJson: () => void
  onExportCsv: () => void
  onShowVersions?: () => void
}) {
  const cloudBadge = templateCloudBadge(saved)
  const isRenaming = renameValue !== null
  const skipBlurConfirmRef = useRef(false)
  const [editingDetails, setEditingDetails] = useState(false)

  return (
    <li className="group rounded-md border border-ink-100 bg-paper-50/70 p-1.5 shadow-[0_1px_2px_rgba(31,28,24,0.04)] transition-colors hover:border-ink-200">
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirmRename()
            else if (e.key === 'Escape') {
              skipBlurConfirmRef.current = true
              onCancelRename()
            }
          }}
          onBlur={() => {
            if (skipBlurConfirmRef.current) {
              skipBlurConfirmRef.current = false
              return
            }
            onConfirmRename()
          }}
          aria-label={`Nombre de la plantilla ${saved.name}`}
          className="input-paper flex-1 min-w-0 text-caption px-1.5 py-0.5 rounded border border-ink-200"
        />
      ) : (
        <div className="flex gap-2">
          <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-ink-100 bg-gradient-to-b from-paper-50 to-ink-50 text-ink-300">
            <WorkspaceTemplateThumb doc={saved.doc} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-caption font-medium text-ink-700">
                    {saved.name}
                  </span>
                  <WorkspaceTemplateStatusBadge status={savedTemplateStatus(saved)} />
                  <span
                    role="img"
                    aria-label={cloudBadge.label}
                    title={cloudBadge.label}
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${CLOUD_DOT_TONES[cloudBadge.tone]}`}
                  />
                </span>
                <span className="block text-micro text-ink-400 tabular-nums">
                  {workspaceTemplateFieldCountLabel(saved.doc)} · {saved.doc.pages.length}{' '}
                  {saved.doc.pages.length === 1 ? 'hoja' : 'hojas'} ·{' '}
                  {workspaceTemplateSavedAtLabel(saved.savedAt)}
                </span>
              </div>
              <WorkspaceTemplateCardMenu
                saved={saved}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onDuplicateAndEdit={onDuplicateAndEdit}
                onDownloadPdf={onDownloadPdf}
                onEditDetails={() => setEditingDetails(true)}
                onExportCsv={onExportCsv}
                onExportJson={onExportJson}
                onShowVersions={onShowVersions}
                onStartRename={onStartRename}
              />
            </div>

            <WorkspaceTemplateDetails
              saved={saved}
              editing={editingDetails}
              onCloseEdit={() => setEditingDetails(false)}
              onUpdateMeta={onUpdateMeta}
            />

            <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1">
              <button
                type="button"
                onClick={onUseTemplate}
                aria-label={`Rellenar planilla ${saved.name}`}
                title="Rellenar sin modificar la plantilla"
                className="btn-accent inline-flex h-7 items-center justify-center px-2 text-micro"
              >
                Rellenar plantilla
              </button>
              <button
                type="button"
                onClick={onEditStructure}
                aria-label={`Editar estructura de planilla ${saved.name}`}
                title="Editar casilleros"
                className="btn-ghost inline-flex h-7 items-center justify-center gap-1 px-2 text-micro"
              >
                <PencilIcon size={11} />
                Editar plantilla
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
