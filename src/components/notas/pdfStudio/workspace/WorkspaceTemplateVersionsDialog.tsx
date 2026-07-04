import { useEffect, useRef, useState } from 'react'
import type { PdfStudioTemplateVersion } from '../../../../api/pdfStudioTemplates'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { useModalOverlay } from '../../../../hooks/useModalOverlay'
import type { WorkspaceTemplateCloud } from './useWorkspaceTemplateCloud'
import { workspaceTemplateSavedAtLabel } from './workspaceTemplateCardModel'

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Historial de una plantilla en la nube: lista las versiones retenidas (las
 * últimas 10) y permite restaurar una — la versión elegida pasa a ser el
 * estado actual y lo anterior queda, a su vez, en el historial.
 */
export function WorkspaceTemplateVersionsDialog({
  saved,
  templateCloud,
  onClose,
}: {
  saved: SavedDoc
  templateCloud: WorkspaceTemplateCloud
  onClose: () => void
}) {
  const overlay = useModalOverlay({ open: true, onClose })
  const [versions, setVersions] = useState<PdfStudioTemplateVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  // La identidad de templateCloud cambia por render del workspace: vía ref
  // el efecto de carga corre una sola vez por plantilla.
  const cloudRef = useRef(templateCloud)
  cloudRef.current = templateCloud
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    cloudRef.current
      .listTemplateVersions(saved)
      .then((list) => {
        if (aliveRef.current) setVersions(list)
      })
      .catch(() => {
        if (aliveRef.current) {
          setError('No pudimos cargar el historial. Revisa tu conexión.')
        }
      })
    return () => {
      aliveRef.current = false
    }
  }, [saved])

  async function restore(version: PdfStudioTemplateVersion) {
    setBusyId(version.id)
    setFeedback(null)
    try {
      const ok = await cloudRef.current.restoreTemplateVersion(saved, version.id)
      if (!aliveRef.current) return
      setFeedback(
        ok
          ? `Restaurada la versión del ${workspaceTemplateSavedAtLabel(Date.parse(version.savedAt))}.`
          : 'No se pudo restaurar esa versión.',
      )
      if (ok) {
        // El estado reemplazado acaba de entrar al historial: refrescar.
        const list = await cloudRef.current.listTemplateVersions(saved).catch(() => null)
        if (aliveRef.current && list) setVersions(list)
      }
    } catch {
      if (aliveRef.current) {
        setFeedback('No se pudo restaurar esa versión. Revisa tu conexión.')
      }
    } finally {
      if (aliveRef.current) setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/30 p-4">
      <section
        ref={overlay.dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Versiones de ${saved.name}`}
        className="animate-pdf-panel-in flex max-h-[70vh] w-[min(92vw,420px)] flex-col rounded-md border border-ink-100 bg-paper-50 p-3 shadow-xl shadow-ink-900/20"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-body font-semibold text-ink-800">
              Versiones de «{saved.name}»
            </h3>
            <p className="text-micro text-ink-400">
              Cada guardado conserva la versión anterior (se guardan las últimas 10).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-caption text-ink-500 hover:bg-ink-100/60"
          >
            Cerrar
          </button>
        </div>
        {feedback ? (
          <p
            role="status"
            className="mb-2 rounded-md bg-[color:var(--accent-sage-soft)] px-2 py-1.5 text-micro text-[color:var(--accent-sage)]"
          >
            {feedback}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="alert-error px-2 py-1.5 text-micro">{error}</p>
          ) : versions === null ? (
            <p className="px-2 py-3 text-caption text-ink-400">Cargando historial…</p>
          ) : versions.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-200 px-3 py-4 text-caption text-ink-500">
              Todavía no hay versiones anteriores: aparecerán con el próximo guardado.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-ink-100 bg-paper-50/70 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-caption font-medium text-ink-700 tabular-nums">
                      {workspaceTemplateSavedAtLabel(Date.parse(version.savedAt))}
                    </p>
                    <p className="truncate text-micro text-ink-400">
                      {version.name} · {sizeLabel(version.byteSize)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restore(version)}
                    disabled={busyId !== null}
                    aria-label={`Restaurar la versión del ${workspaceTemplateSavedAtLabel(Date.parse(version.savedAt))}`}
                    className="btn-ghost h-6 shrink-0 px-2 text-micro"
                  >
                    {busyId === version.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
