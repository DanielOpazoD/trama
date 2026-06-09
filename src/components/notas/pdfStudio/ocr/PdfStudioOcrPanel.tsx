import type { PdfOcrLanguage } from '../../../../lib/pdfStudio/ocr/pdfOcr'
import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { assessPdfOcrDocument } from '../../../../lib/pdfStudio/ocr/pdfOcrLimits'

export function PdfStudioOcrPanel({
  disabled,
  doc,
  language,
  running,
  status,
  totalPages,
  onCancel,
  onChangeLanguage,
  onRun,
}: {
  disabled: boolean
  doc: PdfDoc
  language: PdfOcrLanguage
  running: boolean
  status: string | null
  totalPages: number
  onCancel: () => void
  onChangeLanguage: (language: PdfOcrLanguage) => void
  onRun: () => void
}) {
  const assessment = assessPdfOcrDocument(doc)
  const blocked = !assessment.canRunClientSide
  return (
    <section
      aria-label="OCR buscable"
      className="rounded-md border border-ink-100 bg-paper-50/85 px-3 py-2 shadow-sm shadow-ink-900/5"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label
          htmlFor="pdf-ocr-language"
          className="min-w-[9rem] text-caption text-ink-700"
        >
          Idioma OCR
          <select
            id="pdf-ocr-language"
            value={language}
            disabled={running}
            onChange={(event) =>
              onChangeLanguage(event.currentTarget.value as PdfOcrLanguage)
            }
            className="input-paper mt-1 block h-8 w-full rounded-md border border-ink-200 px-2 text-caption"
          >
            <option value="spa">Español</option>
            <option value="eng">Inglés</option>
            <option value="spa+eng">Español + inglés</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onRun}
          disabled={disabled || running || blocked}
          className="inline-flex h-8 items-center rounded-md bg-ink-800 px-3 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800"
        >
          {running ? 'Procesando…' : 'Crear PDF buscable'}
        </button>
        {running && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded-md px-2 text-caption text-ink-500 transition-colors hover:bg-ink-100/60 hover:text-ink-800"
          >
            Cancelar
          </button>
        )}
        <span className="ml-auto hidden text-micro text-ink-300 tabular-nums sm:inline">
          {totalPages} {totalPages === 1 ? 'página' : 'páginas'}
        </span>
      </div>
      {assessment.messages.length > 0 && (
        <div
          role={assessment.severity === 'blocked' ? 'alert' : 'status'}
          className={`mt-2 px-2 py-1.5 text-caption ${
            assessment.severity === 'blocked' ? 'alert-error' : 'alert-warn'
          }`}
        >
          {assessment.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {status && (
        <p role="status" aria-live="polite" className="mt-2 text-caption text-ink-600">
          {status}
        </p>
      )}
    </section>
  )
}
