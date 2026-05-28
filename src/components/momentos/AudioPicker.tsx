import { AudioNote } from './AudioNote'

/**
 * Control de formulario para adjuntar una nota de voz a un momento foto.
 * Componente controlado: el padre (composer o FotoEditModal) maneja el
 * estado del archivo y resuelve `previewSrc` —object-URL local para un
 * archivo recién elegido, o la URL del endpoint para uno ya guardado—.
 *
 * Dos estados:
 *   - sin audio → un botón "Agregar nota de voz" (file picker).
 *   - con audio → el reproductor + "reemplazar" y "quitar".
 *
 * Acepta solo los MIME que el navegador reproduce y que el endpoint
 * `momentos-audio-upload` admite.
 */

const ACCEPT =
  'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/webm,audio/wav,audio/x-wav'

export function AudioPicker({
  previewSrc,
  onPick,
  onClear,
  disabled = false,
}: {
  previewSrc: string | null
  onPick: (file: File) => void
  onClear: () => void
  disabled?: boolean
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onPick(file)
    e.target.value = ''
  }

  if (previewSrc) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <AudioNote src={previewSrc} />
        <label className="section-eyebrow hover:text-ink-700 cursor-pointer transition-colors">
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={handleChange}
            disabled={disabled}
          />
          reemplazar
        </label>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="section-eyebrow hover:text-red-700 transition-colors"
        >
          quitar
        </button>
      </div>
    )
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-700 cursor-pointer transition-colors">
      <input
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
      <WaveGlyph />
      <span className="italic">Agregar nota de voz (opcional)</span>
    </label>
  )
}

/** Glyph de onda de audio — inline, solo se usa acá (precedente: QRGlyph). */
function WaveGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 12v0M8 8v8M12 5v14M16 8v8M20 12v0" />
    </svg>
  )
}
