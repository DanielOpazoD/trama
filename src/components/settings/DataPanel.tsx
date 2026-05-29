import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useEntitiesQuery,
  useExport,
  useImport,
  useQuotesQuery,
  useRelationshipsQuery,
} from '../../state'
import type { ExportPayload } from '../../types'
import { DownloadIcon, UploadIcon } from '../Icons'
import { PanelHeader } from './_shared'
import { RescueOrphansPanel } from '../momentos/RescueOrphansPanel'

/**
 * Settings → Datos.
 *
 * Export: descarga JSON completo de la trama (entities + relationships +
 * quotes del usuario actual).
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

type BucketCount = { incoming: number; news: number; duplicates: number }

type Preview = {
  entities: BucketCount
  relationships: BucketCount
  quotes: BucketCount
  totalIncoming: number
  totalNew: number
  totalDuplicates: number
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

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(t)
  }, [message])

  const preview = useMemo<Preview | null>(() => {
    if (!parsed) return null
    return buildPreview(
      parsed.payload,
      new Set(existingEntities.map((e) => e.id)),
      new Set(existingRelationships.map((r) => r.id)),
      new Set(existingQuotes.map((q) => q.id)),
    )
  }, [parsed, existingEntities, existingRelationships, existingQuotes])

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
      if (payload.version !== 1) {
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
        hint="Exporta toda tu trama como un archivo JSON, o restaura una copia previa. Tu seguro de portabilidad."
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
        className="hidden"
      />

      {/* Preview de import — visible solo cuando hay un archivo parseado
          en espera de confirmación. */}
      {parsed && preview && (
        <ImportPreviewCard
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

/**
 * Card visible solo durante el flujo de import. Hace 3 cosas:
 *   1. Repite la semántica ADITIVA en lenguaje claro — para que el
 *      usuario entienda que esto NO sobreescribe nada.
 *   2. Muestra el desglose de qué va a entrar (por tipo) y cuántas
 *      filas se van a omitir por estar duplicadas.
 *   3. Botones de Cancelar / Confirmar.
 */
function ImportPreviewCard({
  fileName,
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  fileName: string
  preview: Preview
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { entities, relationships, quotes, totalNew, totalDuplicates } = preview

  return (
    <div
      className="mt-4 card-paper p-4 space-y-3 animate-fade-up"
      role="region"
      aria-label="Vista previa de importación"
    >
      <header className="space-y-1">
        <p className="section-eyebrow">Vista previa · {fileName}</p>
        <p className="text-sm text-ink-700 leading-relaxed">
          Esta importación es <strong>aditiva</strong>: agrega lo nuevo a tu trama actual.{' '}
          <strong>No reemplaza</strong> ni borra nada de lo que ya tienes. Las filas con
          el mismo identificador se omiten silenciosas.
        </p>
      </header>

      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-ink-400 text-left">
            <th className="font-normal pb-1">Tipo</th>
            <th className="font-normal pb-1 text-right">En archivo</th>
            <th className="font-normal pb-1 text-right">Nuevas</th>
            <th className="font-normal pb-1 text-right">Duplicadas</th>
          </tr>
        </thead>
        <tbody className="text-ink-700">
          <PreviewRow label="Entidades" stats={entities} />
          <PreviewRow label="Relaciones" stats={relationships} />
          <PreviewRow label="Citas" stats={quotes} />
          <tr className="border-t border-ink-100/60 font-medium">
            <td className="pt-1.5">Total</td>
            <td className="pt-1.5 text-right">{preview.totalIncoming}</td>
            <td className="pt-1.5 text-right">{totalNew}</td>
            <td className="pt-1.5 text-right text-ink-400">{totalDuplicates}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 text-xs text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || totalNew === 0}
          className="px-3 py-1.5 text-xs bg-ink-700 text-paper-50 rounded-md hover:bg-ink-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy
            ? 'Agregando…'
            : totalNew === 0
              ? 'No hay nuevas para agregar'
              : `Agregar ${totalNew} nuevas`}
        </button>
      </div>
    </div>
  )
}

function PreviewRow({ label, stats }: { label: string; stats: BucketCount }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right">{stats.incoming}</td>
      <td className="py-1 text-right">{stats.news}</td>
      <td className="py-1 text-right text-ink-400">{stats.duplicates}</td>
    </tr>
  )
}

/**
 * Calcula el preview comparando los IDs del archivo contra los existentes.
 * Pure function — exportable + testeable sin DOM.
 *
 * Una fila se considera "nueva" si tiene un `id` que NO está en la trama
 * actual. Si el id falta o ya existe, va a "duplicadas" (mismo bucket
 * que el backend skipea con `ON CONFLICT DO NOTHING`).
 */
export function buildPreview(
  payload: ExportPayload,
  existingEntityIds: Set<string>,
  existingRelationshipIds: Set<string>,
  existingQuoteIds: Set<string>,
): Preview {
  const entities = countBucket(payload.entities ?? [], existingEntityIds)
  const relationships = countBucket(payload.relationships ?? [], existingRelationshipIds)
  const quotes = countBucket(payload.quotes ?? [], existingQuoteIds)
  const totalIncoming = entities.incoming + relationships.incoming + quotes.incoming
  const totalNew = entities.news + relationships.news + quotes.news
  const totalDuplicates =
    entities.duplicates + relationships.duplicates + quotes.duplicates
  return { entities, relationships, quotes, totalIncoming, totalNew, totalDuplicates }
}

function countBucket(items: Array<{ id?: string }>, existing: Set<string>): BucketCount {
  let news = 0
  let duplicates = 0
  for (const item of items) {
    if (item.id && !existing.has(item.id)) news++
    else duplicates++
  }
  return { incoming: items.length, news, duplicates }
}
