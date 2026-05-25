import { useEffect, useState } from 'react'

/**
 * DD1: banner amarillo arriba que aparece cuando la app corre en un
 * deploy preview de Netlify.
 *
 * Detecta el hostname pattern `deploy-preview-N--site.netlify.app`. En
 * esos contextos Netlify Database crea una rama de la BD ephemeral por
 * deploy → los cambios que hagas (entidades, momentos, fotos) NO viven
 * en producción.
 *
 * El banner es dismissible por sesión (sessionStorage) para no molestar
 * al usuario que ya entendió. Vuelve a aparecer si abre el preview en
 * una pestaña nueva.
 */
const DISMISS_KEY = 'trama:preview-banner-dismissed'

function isDeployPreview(): boolean {
  if (typeof window === 'undefined') return false
  return /deploy-preview-\d+--/.test(window.location.hostname)
}

export function PreviewBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.sessionStorage.getItem(DISMISS_KEY) === '1'
  })

  // Re-leer en mount por si cambió en otra pestaña (improbable pero
  // mantiene consistencia).
  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  if (dismissed) return null
  if (!isDeployPreview()) return null

  function handleDismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-xs"
      style={{
        backgroundColor: 'var(--accent-gold-soft)',
        color: 'var(--accent-gold)',
        borderBottom: '1px solid var(--accent-gold)',
      }}
    >
      <span className="font-medium">deploy preview</span>{' '}
      <span className="opacity-80">
        — los cambios que hagas acá (entidades, momentos, fotos) viven en una
        BD efímera y NO se trasladan a producción al hacer merge.
      </span>{' '}
      <button
        onClick={handleDismiss}
        className="ml-2 underline hover:no-underline focus-visible:outline-none"
        aria-label="Ocultar banner de preview"
      >
        entendido
      </button>
    </div>
  )
}
