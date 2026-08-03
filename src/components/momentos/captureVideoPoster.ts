/**
 * Captura un póster (JPEG chico) del primer instante de un clip, en el
 * cliente y ANTES de subirlo.
 *
 * **Por qué existe.** La capa de media autenticada (`AuthenticatedMedia`)
 * resuelve cada storageKey bajando el blob COMPLETO por `requestBlob` antes de
 * montarlo — para un video, eso significa que cada miniatura del álbum baja el
 * clip entero solo para pintar un frame. Con un póster guardado como imagen
 * aparte, las miniaturas pesan kilobytes y el video solo se baja cuando el
 * usuario lo reproduce.
 *
 * **Contrato tolerante, como `readVideoDimensions`:** resuelve `null` ante
 * CUALQUIER fallo (codec no decodificable, canvas bloqueado, timeout). El
 * caller sube el clip igual y el render cae al `<video>` de siempre — un
 * póster es una mejora, nunca un requisito.
 *
 * NO es testeable en jsdom (no decodifica video); el test cubre el cableado
 * del composer con este módulo mockeado, y el contrato "null no bloquea".
 */

/** Lado mayor del póster. 720px sobra para tiles del álbum (~300px). */
const POSTER_MAX_EDGE = 720

/** Calidad JPEG. Es una miniatura: prima el peso sobre el detalle. */
const POSTER_JPEG_QUALITY = 0.72

/** Tope total de la captura. Un clip que no decodifica en 8s no va a hacerlo
 *  nunca; mejor subir sin póster que colgar el composer. */
const CAPTURE_TIMEOUT_MS = 8_000

/** Punto de captura: ~medio segundo adentro. El frame 0 de muchos clips de
 *  teléfono es negro o movido; 0.5s suele ser ya una escena real. Se acota a
 *  la duración por si el clip es más corto. */
function posterSeekTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(0.5, duration * 0.25)
}

function scaledDimensions(w: number, h: number): { width: number; height: number } {
  const edge = Math.max(w, h)
  if (edge <= POSTER_MAX_EDGE) return { width: w, height: h }
  const factor = POSTER_MAX_EDGE / edge
  return { width: Math.round(w * factor), height: Math.round(h * factor) }
}

export async function captureVideoPoster(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url

  try {
    return await new Promise<File | null>((resolve) => {
      const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS)

      function finish(result: File | null) {
        clearTimeout(timer)
        resolve(result)
      }

      video.onerror = () => finish(null)

      // Dos fases: metadata (para saber duración y poder seekear) y luego
      // el frame ya decodificado en el punto de captura.
      video.onloadedmetadata = () => {
        video.currentTime = posterSeekTime(video.duration)
      }
      video.onseeked = () => {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return finish(null)
        const dims = scaledDimensions(w, h)
        const canvas = document.createElement('canvas')
        canvas.width = dims.width
        canvas.height = dims.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        try {
          ctx.drawImage(video, 0, 0, dims.width, dims.height)
        } catch {
          return finish(null)
        }
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size === 0) return finish(null)
            finish(new File([blob], 'poster.jpg', { type: 'image/jpeg' }))
          },
          'image/jpeg',
          POSTER_JPEG_QUALITY,
        )
      }
    })
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
