import { DownloadIcon, FilePdfIcon, PlusIcon, UploadIcon } from '../../Icons'

type Step = {
  current: boolean
  label: string
  status: string
  complete: boolean
}

function StepPill({ complete, current, label, status }: Step) {
  return (
    <div
      aria-current={current ? 'step' : undefined}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 ${
        complete
          ? 'border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/35'
          : current
            ? 'border-[color:var(--accent-sage)]/35 bg-paper-50'
            : 'border-ink-100 bg-paper-50'
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          complete ? 'bg-[color:var(--accent-sage)]' : 'bg-ink-200'
        }`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate text-caption font-medium text-ink-800">{label}</p>
        <p className="truncate text-micro text-ink-400">{status}</p>
      </div>
    </div>
  )
}

function actionClass(primary: boolean, tone: 'dark' | 'sage' | 'quiet') {
  if (primary && tone !== 'quiet') {
    return 'inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-800 px-2.5 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800'
  }
  if (tone === 'sage') {
    return 'inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/35 px-2.5 text-caption font-medium text-[color:var(--accent-sage)] transition-colors hover:bg-[color:var(--accent-sage-soft)] disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-300'
  }
  if (tone === 'dark') {
    return 'inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-100 bg-paper-50 px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-40'
  }
  return 'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium text-ink-500 transition-colors hover:bg-ink-100/60 hover:text-ink-800 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-500'
}

export function PdfTemplateWorkflowGuide({
  busy = false,
  fieldCount,
  pageCount,
  saving = false,
  onAddFields,
  onDownloadFillable,
  onImport,
  onSaveTemplate,
}: {
  busy?: boolean
  fieldCount: number
  pageCount: number
  saving?: boolean
  onAddFields: () => void
  onDownloadFillable: () => void
  onImport: () => void
  onSaveTemplate: () => void
}) {
  const hasBase = pageCount > 0
  const hasFields = fieldCount > 0
  const baseStatus = hasBase
    ? `${pageCount} ${pageCount === 1 ? 'página' : 'páginas'}`
    : 'PDF o imagen'
  const fieldStatus = hasFields
    ? `${fieldCount} ${fieldCount === 1 ? 'campo' : 'campos'}`
    : hasBase
      ? 'Marca dónde escribir'
      : 'Primero sube base'
  const saveStatus = hasFields ? 'Lista para usar' : 'Sin campos'
  const activeStep = !hasBase ? 'base' : !hasFields ? 'fields' : 'save'

  return (
    <section
      aria-label="Crear plantilla"
      className="rounded-md border border-ink-100 bg-paper-50/85 p-2 shadow-sm shadow-ink-900/5"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-3">
          <StepPill
            label="Documento"
            status={baseStatus}
            complete={hasBase}
            current={activeStep === 'base'}
          />
          <StepPill
            label="Campos de texto"
            status={fieldStatus}
            complete={hasFields}
            current={activeStep === 'fields'}
          />
          <StepPill
            label="Plantilla"
            status={saveStatus}
            complete={hasFields}
            current={activeStep === 'save'}
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onImport}
            disabled={busy}
            data-primary-action={activeStep === 'base' ? 'true' : undefined}
            className={actionClass(activeStep === 'base', 'dark')}
          >
            <UploadIcon size={13} />
            Subir PDF/imagen
          </button>
          <button
            type="button"
            onClick={onAddFields}
            disabled={!hasBase || busy}
            data-primary-action={activeStep === 'fields' ? 'true' : undefined}
            className={actionClass(activeStep === 'fields', 'sage')}
          >
            <PlusIcon size={13} />
            Marcar espacios
          </button>
          <button
            type="button"
            onClick={onSaveTemplate}
            disabled={!hasFields || busy || saving}
            data-primary-action={activeStep === 'save' ? 'true' : undefined}
            className={actionClass(activeStep === 'save', 'dark')}
          >
            <FilePdfIcon size={13} />
            Guardar plantilla
          </button>
          <button
            type="button"
            onClick={onDownloadFillable}
            disabled={!hasFields || busy || saving}
            className={actionClass(false, 'quiet')}
          >
            <DownloadIcon size={13} />
            PDF rellenable
          </button>
        </div>
      </div>
    </section>
  )
}
