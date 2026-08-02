import type { PdfStudioPreflightReport } from '../../../../lib/pdfStudio/preflight/pdfStudioPreflight'
import {
  describePdfStudioAutosaveState,
  type PdfStudioAutosaveState,
} from '../workspace/pdfStudioAutosaveState'

/**
 * Avisos operativos de Imprenta — y el silencio cuando no hay ninguno.
 *
 * **Antes ocupaba una banda fija diciendo que todo iba bien**: "Autoguardado ·
 * 4 páginas guardadas hace 2 min" junto a "Preflight: 4 páginas · listo para
 * exportar". Dos frases, la misma cuenta repetida, cero decisiones que tomar.
 * Con un documento de cuatro hojas el cromo medía 321px y el contenido 152.
 *
 * La regla ahora es que **un aviso se gana su sitio solo si cambia lo que
 * harías**:
 *
 *   - **Autoguardado.** Se dice `risk` (no se pudo guardar el borrador: puedes
 *     perder el trabajo) y `restored` (apareció contenido que tú no acabas de
 *     traer, y conviene saber de dónde salió). `saving`/`saved`/`idle` callan —
 *     que un guardado automático funcione es lo esperado, no una noticia.
 *   - **Preflight.** Se dicen bloqueos y advertencias. El "listo para exportar"
 *     desaparece: si no hay nada que arreglar, el botón de guardar ya lo dice
 *     estando habilitado.
 *
 * Sin nada que contar devuelve `null` y la banda entera deja de existir.
 */
export function PdfStudioOperationalStatus({
  autosaveState,
  preflightReport,
}: {
  autosaveState: PdfStudioAutosaveState
  preflightReport: PdfStudioPreflightReport
}) {
  const autosave = describePdfStudioAutosaveState(autosaveState)
  const autosaveSpeaks = autosave.tone === 'risk' || autosave.tone === 'restored'
  // `info` queda fuera a propósito: son observaciones sin acción asociada, que
  // es exactamente el ruido que este componente dejó de emitir.
  const issue = preflightReport.blockers[0] ?? preflightReport.warnings[0]

  if (!autosaveSpeaks && !issue) return null

  const issueTone = preflightReport.blockers.length ? 'alert-error' : 'alert-warn'

  return (
    <section
      aria-label="Avisos de Imprenta"
      aria-live="polite"
      className="grid gap-1.5 text-caption"
    >
      {autosaveSpeaks && (
        <p
          className={`rounded-md border px-3 py-2 ${
            autosave.tone === 'risk'
              ? 'alert-error'
              : 'border-ink-100 bg-paper-50 text-ink-700'
          }`}
        >
          {/* Etiqueta y detalle en nodos separados, sin puntuación pegada: el
              rótulo tiene que seguir siendo localizable como texto propio. */}
          <span className="font-semibold">{autosave.label}</span>{' '}
          <span>{autosave.detail}</span>
        </p>
      )}
      {issue && (
        <p className={`rounded-md border px-3 py-2 ${issueTone}`}>
          <span className="font-semibold">
            {issue.severity === 'warning' ? 'Advertencia. ' : ''}
          </span>
          {issue.message}
          {issue.detail ? ` ${issue.detail}` : ''}
        </p>
      )}
    </section>
  )
}
