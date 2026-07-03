import { useState } from 'react'
import {
  isSavedTemplate,
  type SavedDoc,
} from '../../../../lib/pdfStudio/render/persistence'
import { ChevronLeftIcon, ChevronRightIcon, FilePdfIcon } from '../../../Icons'
import { IconButton } from '../../../IconButton'
import type { WorkspacePanelProps } from './WorkspacePanelProps'
import { WorkspaceSavedDocsSection } from './WorkspaceSavedDocsSection'
import { WorkspaceTemplatesSection } from './WorkspaceTemplatesSection'
import { WorkspaceTemplateVersionsDialog } from './WorkspaceTemplateVersionsDialog'

const ACCENT = 'var(--accent-sage)'
export function WorkspacePanel({
  saved,
  folders,
  templatesEnabled = true,
  canSave,
  canSaveTemplate,
  onSaveCreation,
  onCreateFolder,
  onRenameFolder,
  onUpdateFolderColor,
  onDeleteFolder,
  onSaveTemplate,
  saveTemplateSignal = 0,
  suggestedSaveName,
  onOpenSaved,
  onUseTemplate,
  onDuplicateSaved,
  onDuplicateAndEditSaved,
  onUpdateSavedMeta,
  onRenameSaved,
  onMoveSavedToFolder,
  onDeleteSaved,
  onDownloadSaved,
  onExportTemplatePackage,
  templateCloud,
  collapsed,
  onToggleCollapsed,
}: WorkspacePanelProps) {
  const [versionsFor, setVersionsFor] = useState<SavedDoc | null>(null)
  const templates = saved.filter(isSavedTemplate)
  const creations = saved.filter((s) => !isSavedTemplate(s))
  const savedCount = templatesEnabled ? saved.length : creations.length

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label="Mostrar el panel de PDFs guardados"
        title="Mostrar guardados"
        className="surface-sidebar flex h-full w-full flex-col items-center gap-2 border-r border-ink-100 px-1.5 py-3 text-ink-400 hover:bg-ink-100/30 hover:text-ink-700 transition-colors"
      >
        <ChevronRightIcon size={14} />
        <FilePdfIcon size={14} />
        <span className="text-micro tabular-nums" style={{ color: ACCENT }}>
          {savedCount}
        </span>
      </button>
    )
  }

  return (
    <aside className="surface-sidebar flex h-full w-60 flex-col overflow-hidden border-r border-ink-100">
      <header className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-ink-100/70 shrink-0">
        <span className="section-eyebrow-serif" style={{ color: ACCENT }}>
          mesa de trabajo
        </span>
        <IconButton
          onClick={onToggleCollapsed}
          label="Ocultar el panel"
          title="Ocultar"
          className="touch-target p-1 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors shrink-0"
        >
          <ChevronLeftIcon size={14} />
        </IconButton>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {templatesEnabled && (
          <>
            <WorkspaceTemplatesSection
              templates={templates}
              canSaveTemplate={canSaveTemplate}
              saveTemplateSignal={saveTemplateSignal}
              onSaveTemplate={onSaveTemplate}
              onOpenSaved={onOpenSaved}
              onUseTemplate={onUseTemplate}
              onDuplicateSaved={onDuplicateSaved}
              onDuplicateAndEditSaved={onDuplicateAndEditSaved}
              onUpdateSavedMeta={onUpdateSavedMeta}
              onRenameSaved={onRenameSaved}
              onDeleteSaved={onDeleteSaved}
              onDownloadSaved={onDownloadSaved}
              onExportTemplatePackage={onExportTemplatePackage}
              onShowVersions={templateCloud ? setVersionsFor : undefined}
            />
            {versionsFor && templateCloud ? (
              <WorkspaceTemplateVersionsDialog
                saved={versionsFor}
                templateCloud={templateCloud}
                onClose={() => setVersionsFor(null)}
              />
            ) : null}

            <div className="mx-2.5 border-t border-ink-100/70" />
          </>
        )}

        <WorkspaceSavedDocsSection
          creations={creations}
          canSave={canSave}
          folders={folders}
          suggestedName={suggestedSaveName}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onUpdateFolderColor={onUpdateFolderColor}
          onDeleteFolder={onDeleteFolder}
          onSaveCreation={onSaveCreation}
          onOpenSaved={onOpenSaved}
          onRenameSaved={onRenameSaved}
          onDeleteSaved={onDeleteSaved}
          onDownloadSaved={onDownloadSaved}
          onMoveSavedToFolder={onMoveSavedToFolder}
        />
      </div>
    </aside>
  )
}
