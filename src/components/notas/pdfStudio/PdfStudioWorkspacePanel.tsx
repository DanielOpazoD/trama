import type { ComponentProps } from 'react'
import { isPdfTemplate } from '../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../lib/pdfStudio/render/persistence'
import { PdfStudioWorkspacePanelHost } from './shell/PdfStudioWorkspacePanelHost'
import type { usePdfStudioWorkspace } from './workspace/usePdfStudioWorkspace'

type Workspace = ReturnType<typeof usePdfStudioWorkspace>

export function PdfStudioWorkspacePanel({
  canSaveTemplate,
  docTitle,
  downloadSaved,
  empty,
  onOpenSavedWithMode,
  onOpenTemplateWithFillMode,
  onSaveTemplate,
  saveTemplateSignal,
  setTextPage,
  show,
  templatesEnabled,
  workspace,
}: {
  canSaveTemplate: boolean
  docTitle: string | undefined
  downloadSaved: ComponentProps<typeof PdfStudioWorkspacePanelHost>['onDownloadSaved']
  empty: boolean
  onOpenSavedWithMode: (saved: SavedDoc) => void
  onOpenTemplateWithFillMode: (saved: SavedDoc) => void
  onSaveTemplate: (name: string) => void
  saveTemplateSignal: number
  setTextPage: (page: number | null) => void
  show: boolean
  templatesEnabled: boolean
  workspace: Workspace
}) {
  return (
    <PdfStudioWorkspacePanelHost
      show={show}
      folders={workspace.folders}
      saved={workspace.saved}
      templatesEnabled={templatesEnabled}
      canSave={!empty}
      canSaveTemplate={canSaveTemplate}
      suggestedSaveName={docTitle}
      collapsed={workspace.panelCollapsed}
      onCreateFolder={workspace.createFolder}
      onRenameFolder={workspace.renameFolder}
      onUpdateFolderColor={workspace.updateFolderColor}
      onDeleteFolder={workspace.removeFolder}
      onSaveCreation={workspace.saveCreation}
      onSaveTemplate={onSaveTemplate}
      saveTemplateSignal={saveTemplateSignal}
      onOpenSaved={(saved) => {
        onOpenSavedWithMode(saved)
        // Editar plantilla / abrir copia: abre el editor directo (sin doble clic).
        if (isPdfTemplate(saved.doc)) setTextPage(0)
      }}
      onUseTemplate={(saved) => {
        onOpenTemplateWithFillMode(saved)
        setTextPage(0)
      }}
      onRenameSaved={workspace.renameSaved}
      onMoveSavedToFolder={workspace.moveSavedToFolder}
      onDeleteSaved={workspace.removeSaved}
      onDownloadSaved={downloadSaved}
      onDuplicateSaved={workspace.duplicateSaved}
      onDuplicateAndEditSaved={(saved) => {
        // Crear una planilla nueva desde una existente: duplica y abre la copia.
        const copy = workspace.duplicateSaved(saved)
        onOpenSavedWithMode(copy)
        setTextPage(0)
      }}
      onUpdateSavedMeta={workspace.updateSavedMeta}
      onExportTemplatePackage={workspace.exportTemplatePackage}
      onToggleCollapsed={() => workspace.setPanelCollapsed((collapsed) => !collapsed)}
    />
  )
}
