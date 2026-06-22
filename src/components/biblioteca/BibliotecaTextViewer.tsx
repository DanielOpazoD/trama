import { useEffect, useState } from 'react'
import { requestBlob } from '../../api/request'

/**
 * Visor de texto/markdown/JSON de la Biblioteca. Baja el blob por la URL servida
 * AUTENTICADA (`requestBlob` adjunta el bearer; un fetch directo daría 401) y lo
 * lee como texto. Si el mime/extensión es JSON, lo pretty-printea; el markdown
 * se muestra en crudo (plano) — suficiente y honesto para un archivo privado.
 *
 * Panel desplazable, tipografía monoespaciada sobre papel para que el contenido
 * respire como en un editor sobrio.
 */
function BibliotecaTextViewer({
  serveUrl,
  isJson,
}: {
  serveUrl: string
  isJson: boolean
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [text, setText] = useState('')

  useEffect(() => {
    let active = true
    setStatus('loading')
    setText('')
    void (async () => {
      try {
        const blob = await requestBlob(serveUrl)
        const raw = await blob.text()
        if (!active) return
        setText(isJson ? prettyJson(raw) : raw)
        setStatus('ready')
      } catch {
        if (active) setStatus('error')
      }
    })()
    return () => {
      active = false
    }
  }, [serveUrl, isJson])

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-caption text-ink-400">No se pudo abrir el archivo</p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-caption text-ink-400">cargando…</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-paper-50">
      <pre className="px-5 py-4 text-caption leading-relaxed text-ink-700 whitespace-pre-wrap break-words font-mono">
        {text}
      </pre>
    </div>
  )
}

/** Re-formatea JSON con indentación; si no parsea, devuelve el texto crudo. */
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export default BibliotecaTextViewer
