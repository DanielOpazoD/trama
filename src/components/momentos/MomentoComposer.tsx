import { useState, type FormEvent } from 'react'
import type { MomentoKind } from '../../types'
import type { useMomentoComposer } from './useMomentoComposer'
import { MomentoQRModal } from './MomentoQRModal'

type Composer = ReturnType<typeof useMomentoComposer>

/**
 * Form de captura de un nuevo Momento. Toda la state vive en el hook
 * `useMomentoComposer` — este archivo es presentación pura. Las tres
 * branches por kind son sub-componentes internos (NotaFields,
 * RecorteFields, FotoFields) porque conviven y se intercambian con
 * el toggle de arriba; separarlos en archivos sumaría ruido sin
 * dar reuso.
 */
export function MomentoComposer({ composer }: { composer: Composer }) {
  // τ-mobile-bridge: state local del modal QR. Vive acá adentro porque
  // el botón vive en este componente y no hay otro lugar que necesite
  // saber si está abierto.
  const [qrOpen, setQrOpen] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    composer.submit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-10 p-5 bg-paper-100/40 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
    >
      <header className="stack-2 pb-3 border-b border-ink-100/60 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p
            className="section-eyebrow-serif"
            style={{ color: 'var(--accent-gold)' }}
          >
            nueva entrada
          </p>
          <h3 className="font-serif text-xl text-ink-800 leading-tight">
            {composer.kind === 'nota'
              ? '¿Qué viste, leíste o pensaste hoy?'
              : composer.kind === 'recorte'
                ? 'Algo del mundo que te llamó la atención'
                : 'Una imagen del día'}
          </h3>
        </div>
        {/* τ-mobile-bridge: botón QR — solo se muestra cuando el kind
            es Foto, porque ese es el caso donde tener el celular a
            mano cambia el flujo. Para nota/recorte el desktop alcanza. */}
        {composer.kind === 'foto' && (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors shrink-0 flex items-center gap-1.5"
            title="Escanear QR para abrir el composer en el celular"
            aria-label="Abrir en el celular vía QR"
          >
            <QRGlyph />
            <span>celular</span>
          </button>
        )}
      </header>

      <KindTabs kind={composer.kind} onChange={composer.setKind} />

      {composer.kind === 'nota' && <NotaFields composer={composer} />}
      {composer.kind === 'recorte' && <RecorteFields composer={composer} />}
      {composer.kind === 'foto' && <FotoFields composer={composer} />}

      <MomentoQRModal open={qrOpen} onClose={() => setQrOpen(false)} />

      <div className="flex items-center justify-between gap-3 pt-1">
        {/* υ-no-ai: copy simplificado. Antes mostraba "La IA propone
            vínculos…" / "La IA lee la imagen y propone caption…" — el
            flow de IA se removió, así que esa promesa quedaba colgada.
            Ahora un único hint neutro: el momento se guarda fechado. */}
        <p className="text-caption text-ink-300 italic">
          Se guarda fechado hoy.
        </p>
        <button
          type="submit"
          disabled={composer.isPending}
          className="btn-ink"
        >
          {composer.photoUploading
            ? 'Subiendo…'
            : composer.isPending
              ? 'Guardando…'
              : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function KindTabs({
  kind,
  onChange,
}: {
  kind: MomentoKind
  onChange: (k: MomentoKind) => void
}) {
  return (
    <div className="flex gap-1 p-1 bg-paper-50/60 rounded-lg border border-ink-100/50 w-fit">
      {(['nota', 'recorte', 'foto'] as MomentoKind[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-3 py-1 rounded text-caption transition-all duration-150 active:scale-95 ${
            kind === k
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          {k === 'nota' ? 'Nota' : k === 'recorte' ? 'Recorte' : 'Foto'}
        </button>
      ))}
    </div>
  )
}

function NotaFields({ composer }: { composer: Composer }) {
  return (
    <textarea
      value={composer.noteDraft}
      onChange={(e) => composer.setNoteDraft(e.target.value)}
      placeholder="Una observación, una idea, un recuerdo del día…"
      rows={3}
      className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
      disabled={composer.isPending}
    />
  )
}

function RecorteFields({ composer }: { composer: Composer }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="url"
          value={composer.recorteUrl}
          onChange={(e) => composer.setRecorteUrl(e.target.value)}
          onBlur={composer.fetchPreview}
          placeholder="https://… (opcional, pega y la IA lo lee)"
          className="input-paper flex-1"
          disabled={composer.isPending}
        />
        <button
          type="button"
          onClick={composer.fetchPreview}
          disabled={!composer.recorteUrl.trim() || composer.previewing}
          className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 disabled:opacity-50 px-2"
          title="Buscar título y descripción de la URL"
        >
          {composer.previewing ? 'leyendo…' : '↻ leer'}
        </button>
      </div>
      <input
        type="text"
        value={composer.recorteTitle}
        onChange={(e) => composer.setRecorteTitle(e.target.value)}
        placeholder="Título"
        className="input-paper w-full"
        disabled={composer.isPending}
      />
      <textarea
        value={composer.recorteBody}
        onChange={(e) => composer.setRecorteBody(e.target.value)}
        placeholder="Texto del recorte (el tweet, el párrafo, lo que pegues)"
        rows={3}
        className="input-paper w-full resize-none font-serif text-sm leading-relaxed placeholder:italic"
        disabled={composer.isPending}
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={composer.recorteAuthor}
          onChange={(e) => composer.setRecorteAuthor(e.target.value)}
          placeholder="Autor (opcional)"
          className="input-paper flex-1"
          disabled={composer.isPending}
        />
        <input
          type="text"
          value={composer.recorteSource}
          onChange={(e) => composer.setRecorteSource(e.target.value)}
          placeholder="Fuente (Twitter, blog…)"
          className="input-paper flex-1"
          disabled={composer.isPending}
        />
      </div>
      <textarea
        value={composer.recorteNote}
        onChange={(e) => composer.setRecorteNote(e.target.value)}
        placeholder="Tu nota: por qué te llamó la atención"
        rows={2}
        // φ-photo-polish: sin marginalia-script en el composer — los
        // tres branches (nota, recorte, foto) ahora usan input-paper
        // text-sm sans estándar para coherencia. La marginalia vive en
        // el RENDER del momento, no en el input crudo.
        className="input-paper w-full text-sm resize-none"
        disabled={composer.isPending}
      />
    </div>
  )
}

function FotoFields({ composer }: { composer: Composer }) {
  const hasDrafts = composer.photoDrafts.length > 0
  return (
    <div className="space-y-3">
      <label
        className={`block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          hasDrafts
            ? 'border-ink-100/60 bg-paper-50/40'
            : 'border-ink-200/60 hover:border-ink-300 hover:bg-paper-50/50 p-6'
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
            f.type.startsWith('image/'),
          )
          if (files.length > 0) composer.addPhotoFiles(files)
        }}
      >
        <input
          type="file"
          // υ-multi: `multiple` permite seleccionar varias imágenes en
          // un solo file picker. Combinado con drop-zone multi, el
          // usuario puede armar el episodio en un paso.
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) composer.addPhotoFiles(files)
            // Reset el input para que seleccionar la misma foto otra
            // vez dispare onChange (sin esto el navegador no re-fire).
            e.target.value = ''
          }}
          disabled={composer.isPending}
        />
        {hasDrafts ? (
          <div className="space-y-2">
            {/* Grid de previews — hasta 4 columnas en desktop, 2 en
                mobile. Cada preview tiene un botón × para quitar y un
                "★ portada" para marcarla como la primera del episodio. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {composer.photoDrafts.map((draft, idx) => {
                const isPrimary = idx === 0
                return (
                  <div
                    key={draft.previewUrl}
                    className={`group relative aspect-square overflow-hidden rounded border ${
                      isPrimary
                        ? 'border-2'
                        : 'border-ink-100/60'
                    } bg-paper-100/40`}
                    style={
                      isPrimary
                        ? { borderColor: 'var(--accent-gold)' }
                        : undefined
                    }
                  >
                    <img
                      src={draft.previewUrl}
                      alt={`foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Botón × — quitar */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        composer.removePhotoDraft(idx)
                      }}
                      className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-ink-900/70 text-paper-50 text-xs hover:bg-ink-900 transition-colors"
                      aria-label={`Quitar foto ${idx + 1}`}
                      title="Quitar foto"
                      disabled={composer.isPending}
                    >
                      ×
                    </button>
                    {/* φ-photo-polish: badge "portada" cuando es la
                        primera; en las otras, botón "★ portada" que
                        la mueve al inicio. */}
                    {isPrimary ? (
                      <span
                        className="absolute top-1 left-1 text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded leading-none font-medium"
                        style={{
                          backgroundColor: 'var(--accent-gold)',
                          color: '#fff',
                        }}
                        aria-label="Foto principal del episodio"
                      >
                        ★ portada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          composer.setPrimaryPhoto(idx)
                        }}
                        className="absolute top-1 left-1 text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded leading-none bg-ink-900/55 text-paper-50 hover:bg-ink-900/80 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Marcar foto ${idx + 1} como portada`}
                        title="Marcar como portada"
                        disabled={composer.isPending}
                      >
                        ★ portada
                      </button>
                    )}
                    <span
                      className="absolute bottom-1 left-1 text-micro tabular-nums bg-ink-900/60 text-paper-50 px-1 rounded leading-none py-0.5"
                      aria-hidden
                    >
                      {idx + 1}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-caption text-ink-400 italic">
              {composer.photoDrafts.length}{' '}
              {composer.photoDrafts.length === 1 ? 'foto' : 'fotos'}
              {composer.photoDrafts.length > 1 &&
                ' · pasa el cursor sobre una y elige "★ portada" para fijarla primero'}
              {composer.photoDrafts.length === 1 && ' · click para agregar más'}
            </p>
          </div>
        ) : (
          <div className="text-ink-400">
            <p className="text-sm">
              Arrastra una o varias imágenes aquí, o click para elegir
            </p>
            <p className="text-caption italic mt-1">
              JPEG / PNG / WebP / GIF · se comprimen antes de subir
            </p>
          </div>
        )}
      </label>
      {/* υ-multi: progreso del upload. Aparece sólo cuando hay
          múltiples archivos en proceso — para un solo file el botón
          "Subiendo…" ya alcanza. */}
      {composer.photoUploadProgress && composer.photoUploadProgress.total > 1 && (
        <p className="text-caption text-ink-400 italic tabular-nums">
          Subiendo {composer.photoUploadProgress.done} de{' '}
          {composer.photoUploadProgress.total}…
        </p>
      )}
      {/* φ-photo-polish: dos inputs equivalentes en tipografía.
          Ambos text-sm sans normal, mismo padding implícito de
          input-paper. Antes el textarea usaba marginalia-script
          (Caveat 17px italic) que competía visualmente con el input
          de texto y rompía la unidad del card. La marginalia sigue
          existiendo, pero como expresión visual en el RENDER del
          momento, no como input que se va a guardar pelado. */}
      <input
        type="text"
        value={composer.photoCaption}
        onChange={(e) => composer.setPhotoCaption(e.target.value)}
        placeholder="Título del episodio (opcional)"
        className="input-paper w-full text-sm"
        disabled={composer.isPending}
      />
      <textarea
        value={composer.photoNote}
        onChange={(e) => composer.setPhotoNote(e.target.value)}
        placeholder="Tu nota sobre el momento (opcional)"
        rows={2}
        className="input-paper w-full text-sm resize-none"
        disabled={composer.isPending}
      />
    </div>
  )
}

/**
 * τ-mobile-bridge: glyph QR inline. Sin agregar al set de Icons porque
 * solo se usa acá. SVG minimal — un "frame" estilizado que evoca un
 * código QR sin pretender serlo. 12×12 a stroke 1.6 para encajar con
 * el tracking-eyebrow del botón.
 */
function QRGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="6" height="6" rx="0.5" />
      <rect x="15" y="3" width="6" height="6" rx="0.5" />
      <rect x="3" y="15" width="6" height="6" rx="0.5" />
      <path d="M15 15h2M21 15v2M15 19v2M19 19h2" />
    </svg>
  )
}
