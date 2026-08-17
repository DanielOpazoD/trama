import { useEffect, useState } from 'react'
import { requestBlob } from '../../api/request'
import { api } from '../../api'
import {
  readOfficeDocument,
  readOfficeSheets,
} from '../../lib/biblioteca/officeParseClient'
import type { LibraryItem } from '../../types/biblioteca'
import { officeKindFor } from './helpers'

/**
 * Visor de Office de la Biblioteca: previsualiza Word (.docx) y Excel
 * (.xlsx/.xls) renderizándolos a HTML en el navegador.
 *
 * Baja el blob por la URL servida AUTENTICADA (`requestBlob` adjunta el bearer;
 * un fetch directo daría 401) como `arrayBuffer` y, según el tipo:
 *   - docx → `mammoth` produce HTML semántico.
 *   - xlsx → SheetJS arma una tabla HTML por hoja, con selector si hay varias.
 * En ambos casos el HTML se SANITIZA con DOMPurify antes de inyectarlo
 * (`dangerouslySetInnerHTML`), porque viene de un archivo arbitrario del usuario.
 *
 * DOMPurify se importa DINÁMICAMENTE: este componente se monta con
 * `lazy(() => import(...))` desde BibliotecaViewer, así que su chunk recién se
 * baja cuando el usuario abre un documento de Office. Nunca toca el bundle
 * inicial.
 *
 * Ni `xlsx` ni `mammoth` se importan acá: los dos viven dentro de un Worker
 * desechable (`lib/biblioteca/officeParseClient`), que es donde se lee el
 * archivo del usuario. Si alguna de esas importaciones vuelve a este archivo,
 * vuelve el parseo al hilo principal y con él el riesgo.
 */
function BibliotecaOfficeViewer({
  item,
  serveUrl,
}: {
  item: LibraryItem
  serveUrl: string
}) {
  const kind = officeKindFor(item)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  // HTML ya sanitizado. Para docx es un único string; para xlsx, uno por hoja.
  const [docHtml, setDocHtml] = useState('')
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([])
  const [activeSheet, setActiveSheet] = useState(0)

  useEffect(() => {
    let active = true
    setStatus('loading')
    setDocHtml('')
    setSheets([])
    setActiveSheet(0)

    void (async () => {
      try {
        if (!kind) throw new Error('tipo no soportado')
        const blob = await requestBlob(serveUrl)
        const arrayBuffer = await blob.arrayBuffer()
        // DOMPurify se importa junto al convertidor: ambos viven en chunks lazy.
        const { sanitize } = await loadSanitizer()
        // Si el visor se cerró o cambió de archivo mientras bajaba el
        // sanitizador, no se arranca el Worker: leer un documento que ya nadie
        // va a ver puede ocupar CPU y memoria hasta 30 segundos (el tope del
        // temporizador) por un resultado que se descarta igual.
        if (!active) return

        if (kind === 'docx') {
          const html = await readOfficeDocument(arrayBuffer)
          if (!active) return
          setDocHtml(sanitize(html))
        } else {
          // El parseo ocurre en un Worker desechable (ver officeParseClient).
          // Lo que vuelve es HTML crudo, así que se sanitiza acá.
          const parsed = await readOfficeSheets(arrayBuffer)
          if (!active) return
          setSheets(parsed.map((sheet) => ({ ...sheet, html: sanitize(sheet.html) })))
        }
        setStatus('ready')
      } catch {
        if (active) setStatus('error')
      }
    })()

    return () => {
      active = false
    }
  }, [serveUrl, kind])

  if (status === 'error') {
    return <OfficeError item={item} />
  }

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <p className="text-caption text-ink-400">cargando…</p>
      </div>
    )
  }

  if (kind === 'docx') {
    return (
      <div className="h-full overflow-auto bg-paper-50">
        {/* `office-prose` da tipografía legible (serif, ancho acotado, ritmo
            vertical) al HTML que produce mammoth, sin clases utilitarias en cada
            etiqueta generada. */}
        <div
          className="office-prose mx-auto max-w-prose px-6 py-8 text-ink-800"
          // El HTML ya pasó por DOMPurify arriba; es seguro inyectarlo.
          dangerouslySetInnerHTML={{ __html: docHtml }}
        />
      </div>
    )
  }

  // xlsx: tabla(s). Selector de hojas si hay más de una.
  const current = sheets[activeSheet]
  return (
    <div className="flex h-full flex-col bg-paper-50">
      {sheets.length > 1 && (
        <SheetTabs sheets={sheets} active={activeSheet} onSelect={setActiveSheet} />
      )}
      <div className="office-sheet min-h-0 flex-1 overflow-auto px-4 py-4">
        {current && (
          <div
            // El HTML de cada hoja ya pasó por DOMPurify arriba.
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
        )}
      </div>
    </div>
  )
}

/** Tabs segmentadas para elegir la hoja activa de un libro de varias hojas. */
function SheetTabs({
  sheets,
  active,
  onSelect,
}: {
  sheets: { name: string }[]
  active: number
  onSelect: (index: number) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Hojas"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-100/80 bg-paper-100/40 px-3 py-2"
    >
      {sheets.map((sheet, index) => {
        const selected = index === active
        return (
          <button
            key={`${sheet.name}-${index}`}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(index)}
            className={`shrink-0 rounded-full px-3 py-1 text-caption transition-colors ${
              selected
                ? 'bg-ink-800 text-paper-50'
                : 'text-ink-500 hover:bg-ink-100/70 hover:text-ink-700'
            }`}
          >
            {sheet.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Estado de error: mismo registro honesto que el resto del visor. Ofrece bajar
 * el archivo para abrirlo en una app de escritorio cuando la previsualización
 * falla (documento corrupto, formato no soportado, etc.).
 */
function OfficeError({ item }: { item: LibraryItem }) {
  const [downloading, setDownloading] = useState(false)
  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      await api.biblioteca.download(item)
    } catch {
      // Silencioso: si tampoco se puede bajar, el mensaje ya invita a hacerlo.
    } finally {
      setDownloading(false)
    }
  }
  return (
    <div className="flex h-full items-center justify-center bg-paper-50 px-6">
      <div className="text-center">
        <p className="text-caption text-ink-400">
          No se pudo previsualizar este archivo. Descargalo para abrirlo.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn-ink mt-4 inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          Descargar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cargadores lazy. Aislados en funciones para dejar el `import()` explícito y
// reusable, y para resolver el interop de CommonJS (dompurify expone el valor
// en `default` bajo algunos modos de interop).
// ---------------------------------------------------------------------------

type Sanitizer = { sanitize: (dirty: string) => string }

async function loadSanitizer(): Promise<Sanitizer> {
  const mod = (await import('dompurify')) as unknown as Sanitizer | { default: Sanitizer }
  return 'sanitize' in mod ? mod : mod.default
}

export default BibliotecaOfficeViewer
