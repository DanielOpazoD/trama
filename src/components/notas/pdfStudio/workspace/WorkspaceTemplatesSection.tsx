import { useEffect, useState } from 'react'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { FilePdfIcon, SearchIcon } from '../../../Icons'
import { WorkspaceTemplateCard } from './WorkspaceTemplateCard'
import { WorkspaceTemplateCreateBox } from './WorkspaceTemplateCreateBox'

export function WorkspaceTemplatesSection({
  templates,
  canSaveTemplate,
  saveTemplateSignal = 0,
  onSaveTemplate,
  onOpenSaved,
  onUseTemplate,
  onDuplicateSaved,
  onRenameSaved,
  onDeleteSaved,
  onDownloadSaved,
  onExportTemplatePackage,
}: {
  templates: SavedDoc[]
  canSaveTemplate: boolean
  saveTemplateSignal?: number
  onSaveTemplate: (name: string) => void
  onOpenSaved: (s: SavedDoc) => void
  onUseTemplate: (s: SavedDoc) => void
  onDuplicateSaved: (s: SavedDoc) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
  onDownloadSaved: (s: SavedDoc) => void
  onExportTemplatePackage: (s: SavedDoc, format: 'json' | 'csv') => void
}) {
  const [newTemplateName, setNewTemplateName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [templateQuery, setTemplateQuery] = useState('')
  const visibleTemplates = templates.filter((s) =>
    s.name.toLowerCase().includes(templateQuery.trim().toLowerCase()),
  )

  useEffect(() => {
    if (canSaveTemplate && saveTemplateSignal > 0) {
      setNewTemplateName('')
    }
  }, [canSaveTemplate, saveTemplateSignal])

  const confirmNewTemplate = () => {
    const name = (newTemplateName ?? '').trim()
    if (name) onSaveTemplate(name)
    setNewTemplateName(null)
  }

  const confirmRename = () => {
    if (renaming) {
      const name = renaming.value.trim()
      if (name) onRenameSaved(renaming.id, name)
    }
    setRenaming(null)
  }

  return (
    <section className="pb-2">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-0.5">
        <h3 className="section-eyebrow-serif flex items-center gap-1.5 text-ink-400">
          <FilePdfIcon size={12} />
          Planillas
          <span className="text-ink-300 tabular-nums">({templates.length})</span>
        </h3>
      </div>

      <WorkspaceTemplateCreateBox
        canSaveTemplate={canSaveTemplate}
        name={newTemplateName}
        onCancel={() => setNewTemplateName(null)}
        onConfirm={confirmNewTemplate}
        onNameChange={setNewTemplateName}
        onStart={() => setNewTemplateName('')}
      />

      {templates.length === 0 ? (
        <p className="px-2.5 text-micro text-ink-400">
          Diseña casilleros y guarda la planilla para rellenarla.
        </p>
      ) : (
        <div role="group" aria-label="Rellenar plantilla">
          <div className="px-2 pb-1">
            <p className="text-caption font-medium text-ink-700">Rellenar plantilla</p>
          </div>
          <label className="mx-2 mb-1 flex items-center gap-1.5 rounded-md border border-ink-100 bg-paper-50/70 px-2 py-1.5 text-ink-400">
            <SearchIcon size={12} />
            <span className="sr-only">Buscar planillas</span>
            <input
              type="search"
              role="searchbox"
              aria-label="Buscar planillas"
              value={templateQuery}
              onChange={(e) => setTemplateQuery(e.target.value)}
              placeholder="Buscar planillas"
              className="min-w-0 flex-1 bg-transparent text-caption text-ink-700 placeholder:text-ink-300 outline-none"
            />
          </label>
          {visibleTemplates.length === 0 ? (
            <p className="px-2.5 py-1 text-micro text-ink-400">
              No hay planillas con ese nombre.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 px-2 pt-1">
              {visibleTemplates.map((s) => (
                <WorkspaceTemplateCard
                  key={s.id}
                  saved={s}
                  renameValue={renaming?.id === s.id ? renaming.value : null}
                  onRenameValueChange={(value) => setRenaming({ id: s.id, value })}
                  onConfirmRename={confirmRename}
                  onCancelRename={() => setRenaming(null)}
                  onStartRename={() => setRenaming({ id: s.id, value: s.name })}
                  onUseTemplate={() => onUseTemplate(s)}
                  onEditStructure={() => onOpenSaved(s)}
                  onDuplicate={() => onDuplicateSaved(s)}
                  onDelete={() => onDeleteSaved(s.id)}
                  onDownloadPdf={() => onDownloadSaved(s)}
                  onExportJson={() => onExportTemplatePackage(s, 'json')}
                  onExportCsv={() => onExportTemplatePackage(s, 'csv')}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
