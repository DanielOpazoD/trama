import { useEffect, useRef, useState } from 'react'
import { useExport, useImport } from '../state'
import type { ExportPayload } from '../types'
import {
  CloseIcon,
  DownloadIcon,
  MoonIcon,
  SunIcon,
  UploadIcon,
} from './Icons'

export function Settings({
  open,
  onClose,
  theme,
  onToggleTheme,
}: {
  open: boolean
  onClose: () => void
  theme: 'paper' | 'night'
  onToggleTheme: () => void
}) {
  const doExport = useExport()
  const doImport = useImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Esc to close.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Clear status messages a few seconds after they appear.
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
      const imported = await doImport(payload)
      setMessage(`Importado: ${imported} elementos`)
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al importar')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!open) return null

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar configuración"
        className="fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-sm cursor-default animate-view-fade"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Configuración"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-md
                   bg-paper-50/95 border border-ink-100/60 rounded-2xl shadow-2xl shadow-ink-900/20
                   backdrop-blur-md animate-slide-in-right overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-ink-100/60 flex items-baseline justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-300 mb-1">
              ajustes
            </p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">Configuración</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors active:scale-90"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="p-6 space-y-7">
          {/* Theme */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Apariencia</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Modo papel para el día, modo noche para horas tardías. La elección
                se recuerda en este navegador.
              </p>
            </div>
            <div className="flex gap-2 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
              <button
                onClick={() => theme !== 'paper' && onToggleTheme()}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 active:scale-95 ${
                  theme === 'paper'
                    ? 'bg-paper-50 text-ink-700 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                }`}
              >
                <SunIcon size={14} />
                Papel
              </button>
              <button
                onClick={() => theme !== 'night' && onToggleTheme()}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 active:scale-95 ${
                  theme === 'night'
                    ? 'bg-paper-50 text-ink-700 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                }`}
              >
                <MoonIcon size={14} />
                Noche
              </button>
            </div>
          </section>

          {/* Data */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Datos</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Exporta toda tu trama como un archivo JSON, o restaura una copia
                previa. Tu seguro de portabilidad.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={busy}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DownloadIcon size={13} />
                Exportar
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadIcon size={13} />
                Importar
              </button>
            </div>
            {message && (
              <p className="text-xs text-ink-500 italic animate-fade-up">
                {message}
              </p>
            )}
          </section>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </>
  )
}
