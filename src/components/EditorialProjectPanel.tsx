import { useEffect, useState } from 'react'
import { useAddMomento, useUpdateReadingTable } from '../state'
import { useToast } from '../state/toast'
import type { ReadingTable, ReadingTableStatus } from '../api'
import { EditorialReader } from './EditorialReader'
import { PrintObject } from './print/PrintObject'
import { renderMarkdown } from './notas/markdown'

const STATUSES: ReadingTableStatus[] = ['borrador', 'redactando', 'revisando', 'cerrado']

/**
 * Panel del proyecto editorial abierto: el borrador deja de ser un snapshot y
 * pasa a ser una superficie de escritura — editar el Markdown, mover el estado,
 * leerlo, y publicarlo de vuelta a la trama como Momento (cierra el lazo
 * capturar → curar → escribir → publicar). Reusa el PATCH de reading_tables.
 */
export function EditorialProjectPanel({
  project,
  onClose,
}: {
  project: ReadingTable
  onClose: () => void
}) {
  const update = useUpdateReadingTable()
  const addMomento = useAddMomento()
  const toast = useToast()
  const [draft, setDraft] = useState(project.draftMarkdown ?? '')
  const [readingOpen, setReadingOpen] = useState(false)
  const [printing, setPrinting] = useState(false)

  // Al cambiar de proyecto (o al llegar cambios remotos del borrador), resync.
  useEffect(() => {
    setDraft(project.draftMarkdown ?? '')
  }, [project.id, project.draftMarkdown])

  const dirty = draft !== (project.draftMarkdown ?? '')

  const saveDraft = () => {
    update.mutate({ id: project.id, patch: { draftMarkdown: draft } })
    toast.show({ message: 'Borrador guardado', tone: 'success' })
  }
  const setStatus = (status: ReadingTableStatus) => {
    update.mutate({ id: project.id, patch: { status } })
  }
  const publish = () => {
    addMomento.mutate({
      kind: 'nota',
      payload: { bodyText: draft.trim() || project.title },
      note: project.title,
    })
    update.mutate({ id: project.id, patch: { status: 'cerrado' } })
    toast.show({ message: 'Proyecto publicado como Momento', tone: 'success' })
  }

  return (
    <section className="card-paper space-y-3 p-4" aria-label="Proyecto editorial">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="section-eyebrow">proyecto</p>
          <h3 className="mt-1 font-serif text-xl text-ink-700">{project.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-micro uppercase tracking-eyebrow text-ink-300 transition-colors hover:text-ink-700"
        >
          cerrar
        </button>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Estado del proyecto"
      >
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={project.status === s}
            className={`rounded-full px-2.5 py-1 text-micro uppercase tracking-eyebrow transition-colors ${
              project.status === s
                ? 'bg-ink-800 text-paper-50'
                : 'text-ink-400 hover:bg-ink-100/60 hover:text-ink-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Borrador del proyecto"
        rows={10}
        // focus-ring-exempt: textarea con foco por cambio de borde (accent)
        className="w-full resize-y rounded-md border border-ink-100 bg-paper-50 p-3 font-serif text-body leading-relaxed text-ink-700 focus:border-[color:var(--accent-primary)] focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={saveDraft}
          disabled={!dirty}
          className="rounded-full bg-ink-800 px-3 py-1.5 text-xs font-medium text-paper-50 transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Guardar borrador
        </button>
        <button
          type="button"
          onClick={() => setReadingOpen(true)}
          className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-[color:var(--accent-primary)]"
        >
          leer
        </button>
        <button
          type="button"
          onClick={() => setPrinting(true)}
          className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-[color:var(--accent-primary)]"
        >
          exportar PDF
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={addMomento.isPending}
          className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-[color:var(--accent-gold)] disabled:opacity-40"
        >
          publicar como momento
        </button>
      </div>

      <EditorialReader
        open={readingOpen}
        onClose={() => setReadingOpen(false)}
        title={project.title}
        markdown={draft}
      />

      {printing && (
        <PrintObject onDone={() => setPrinting(false)}>
          <div className="print-sheet">
            <p className="print-sheet-eyebrow">Trama · proyecto editorial</p>
            <h1>{project.title}</h1>
            <div className="print-sheet-section">{renderMarkdown(draft)}</div>
          </div>
        </PrintObject>
      )}
    </section>
  )
}
