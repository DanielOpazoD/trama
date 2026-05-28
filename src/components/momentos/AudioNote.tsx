import { useRef, useState } from 'react'

/**
 * Reproductor compacto para una nota de voz de un momento foto.
 *
 * No usa los controles nativos del `<audio>` (esa barra cromada rompe la
 * estética papel/tinta): un botón play/pausa propio + una barra de
 * progreso fina + el tiempo en mm:ss. El `<audio>` vive oculto y se
 * maneja por ref.
 *
 * Recibe un `src` ya resuelto —puede ser la URL del endpoint que sirve el
 * blob (`/api/momentos-file/:key`) o un object-URL local para previsualizar
 * un archivo recién elegido antes de subirlo—.
 */
export function AudioNote({ src, className = '' }: { src: string; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      const p = el.play()
      if (p && typeof p.then === 'function') p.catch(() => setPlaying(false))
      setPlaying(true)
    }
  }

  const total = Number.isFinite(duration) && duration > 0 ? duration : 0
  const ratio = total > 0 ? Math.min(current / total, 1) : 0
  const shown = current > 0 ? current : total

  return (
    <div
      className={`inline-flex items-center gap-2.5 bg-paper-50 border border-ink-100/60 rounded-full pl-1 pr-3 py-1 ${className}`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        className="size-8 shrink-0 flex items-center justify-center rounded-full text-paper-50 transition-transform active:scale-95"
        style={{ backgroundColor: 'var(--type-evento)' }}
      >
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <div
        className="h-1 w-28 max-w-full rounded-full bg-ink-100 overflow-hidden"
        aria-hidden
      >
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${ratio * 100}%`, backgroundColor: 'var(--type-evento)' }}
        />
      </div>
      <span className="text-caption tabular-nums text-ink-400 shrink-0">
        {fmt(shown)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      />
    </div>
  )
}

/** Segundos → "m:ss". Defensivo ante NaN/Infinity (duration sin cargar). */
function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function PlayGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a.75.75 0 0 0 1.14.64l10.5-6.5a.75.75 0 0 0 0-1.28l-10.5-6.5A.75.75 0 0 0 8 5.5Z" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}
