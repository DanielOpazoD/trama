import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useEntitiesQuery,
  useExport,
  useInfiniteMomentosQuery,
  useImport,
  useNotesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useTasksQuery,
} from '../../state'
import type { ExportPayload } from '../../types'
import { DownloadIcon, UploadIcon } from '../Icons'
import { PanelHeader } from './_shared'
import { RescueOrphansPanel } from '../momentos/RescueOrphansPanel'
import { DataImportPreviewCard } from './DataImportPreviewCard'
import { buildPreview, type ImportPreview } from './dataImportPreviewModel'

export { buildPreview } from './dataImportPreviewModel'

/**
 * Settings → Datos.
 *
 * Export: descarga el backup estructurado core de la trama: grafo, citas,
 * Momentos, notas, tareas y referencias a blobs.
 *
 * Import: ADITIVO por diseño. El endpoint `/api/import` usa
 * `INSERT ... ON CONFLICT (id) DO NOTHING`, lo que significa que NUNCA
 * sobreescribe ni borra rows existentes — solo agrega las que no estaban.
 *
 * Para que el usuario entienda esta semántica antes de aplicar, después
 * de elegir un archivo mostramos un **preview** que separa:
 *   - cuántas filas vienen en el archivo (por tipo)
 *   - cuántas son NUEVAS (id no existe aún en su trama)
 *   - cuántas se omitirán por DUPLICADAS (id ya presente)
 *
 * El usuario confirma antes de que la importación se aplique.
 */

type ParsedFile = {
  payload: ExportPayload
  fileName: string
}

export function DataPanel() {
  const doExport = useExport()
  const doImport = useImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Estado del flujo de import: archivo parseado y a la espera de
  // confirmación. Si está `null`, no hay nada pendiente.
  const [parsed, setParsed] = useState<ParsedFile | null>(null)

  // Snapshot de los IDs que YA existen en la trama. Lo usamos para
  // calcular "nuevas vs duplicadas" en el preview sin tener que pegar
  // al backend (las queries ya están cacheadas).
  const { data: existingEntities = [] } = useEntitiesQuery()
  const { data: existingQuotes = [] } = useQuotesQuery()
  const { data: existingRelationships = [] } = useRelationshipsQuery()
  const { data: existingMomentosPages } = useInfiniteMomentosQuery()
  const { data: existingNotes = [] } = useNotesQuery()
  const { data: existingTasks = [] } = useTasksQuery()

  const existingMomentos = useMemo(
    () => existingMomentosPages?.pages.flatMap((page) => page.items) ?? [],
    [existingMomentosPages],
  )

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(t)
  }, [message])

  const preview = useMemo<ImportPreview | null>(() => {
    if (!parsed) return null
    return buildPreview(
      parsed.payload,
      new Set(existingEntities.map((e) => e.id)),
      new Set(existingRelationships.map((r) => r.id)),
      new Set(existingQuotes.map((q) => q.id)),
      new Set(existingMomentos.map((m) => m.id)),
      new Set(existingNotes.map((n) => n.id)),
      new Set(existingTasks.map((t) => t.id)),
    )
  }, [
    parsed,
    existingEntities,
    existingRelationships,
    existingQuotes,
    existingMomentos,
    existingNotes,
    existingTasks,
  ])

  async function handleExport() {
    setBusy(true)
    setMessage(null)
    try {
      const payload = await doExport()
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trama-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Exportado correctamente')
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al exportar')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Al elegir un archivo NO importamos en seco — primero parseamos y
   * dejamos el payload en `parsed`. El render del preview ocurre y el
   * usuario decide si confirma.
   */
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setMessage(null)
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as ExportPayload
      if (payload.version !== 1 && payload.version !== 2) {
        throw new Error(`versión ${payload.version} no soportada`)
      }
      setParsed({ payload, fileName: file.name })
    } catch (err) {
      setMessage(
        err instanceof Error
          ? `Error al leer archivo: ${err.message}`
          : 'Error al leer archivo',
      )
    } finally {
      // Reset del input así el mismo archivo se puede re-elegir si el
      // user cambia de idea sin tocar la página.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * Aplica la importación. El backend nunca reemplaza — los duplicados
   * se omiten silenciosamente (por eso el preview ya los marcó como
   * "duplicadas"). Si hay fallas reales (validación falló por algo no
   * trivial), las mostramos en el mensaje + Settings → Logs.
   */
  async function handleConfirmImport() {
    if (!parsed) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await doImport(parsed.payload)
      const failedCount = result.failed?.length ?? 0
      if (failedCount > 0) {
        const firstReason = result.failed?.[0]?.reason ?? 'desconocido'
        setMessage(
          `Agregadas ${result.imported}, ${failedCount} con error (primero: ${firstReason.slice(0, 60)}). Revisa Logs en Settings.`,
        )
      } else {
        setMessage(`Agregadas ${result.imported} entradas a tu trama`)
      }
      setParsed(null) // limpiar el preview tras aplicar
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al importar')
    } finally {
      setBusy(false)
    }
  }

  function handleCancelImport() {
    setParsed(null)
    setMessage(null)
  }

  return (
    <section>
      <PanelHeader
        title="Datos"
        hint="Exporta el core estructurado de tu trama como JSON, o importa una copia previa. El archivo no incluye bytes de Blobs, tokens ni logs."
      />
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={busy || parsed !== null}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadIcon size={14} />
          Exportar
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || parsed !== null}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UploadIcon size={14} />
          Importar
        </button>
      </div>
      {message && (
        <p className="mt-3 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        aria-label="Importar archivo JSON"
        className="hidden"
      />

      {/* Preview de import — visible solo cuando hay un archivo parseado
          en espera de confirmación. */}
      {parsed && preview && (
        <DataImportPreviewCard
          fileName={parsed.fileName}
          preview={preview}
          busy={busy}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
        />
      )}

      {/* DD1: recovery de fotos subidas desde deploy previews. Solo aparece
          si hay blobs huérfanos. */}
      <div className="mt-10 pt-6 border-t border-ink-100/50">
        <PanelHeader
          title="Fotos huérfanas"
          hint="Imágenes que están en el storage pero ningún Momento las referencia. Suele pasar cuando se sube desde un deploy preview (la BD del preview es efímera)."
        />
        <RescueOrphansPanel />
      </div>
    </section>
  )
}
