import { useEffect, useRef, useState } from 'react'
import { useExport, useImport } from '../../state'
import type { ExportPayload } from '../../types'
import { DownloadIcon, UploadIcon } from '../Icons'
import { PanelHeader } from './_shared'
import { RescueOrphansPanel } from '../momentos/RescueOrphansPanel'

export function DataPanel() {
  const doExport = useExport()
  const doImport = useImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(t)
  }, [message])

  async function handleExport() {
    setBusy(true); setMessage(null)
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

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setMessage(null)
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as ExportPayload
      if (payload.version !== 1) throw new Error(`versión ${payload.version} no soportada`)
      const result = await doImport(payload)
      // El endpoint nuevo devuelve {imported, skipped, failed}. Si hay
      // fallas reales (no solo skipped por duplicado), las contamos
      // explícitamente para que no pasen desapercibidas. Antes una
      // importación con 5 errores de SQL retornaba "imported: 145" sin
      // pista de los 5 perdidos.
      const failedCount = result.failed?.length ?? 0
      if (failedCount > 0) {
        const firstReason = result.failed?.[0]?.reason ?? 'desconocido'
        setMessage(
          `Importados ${result.imported}, ${failedCount} con error (primero: ${firstReason.slice(0, 60)}). Revisa Logs en Settings.`,
        )
      } else {
        setMessage(`Importado: ${result.imported} elementos`)
      }
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al importar')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadIcon size={14} />
          Exportar
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
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
