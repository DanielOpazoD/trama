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
        <p className="text-caption text-ink-300 italic">
          {composer.kind === 'recorte'
            ? 'Al guardar, la IA propone vínculos a tus entidades.'
            : composer.kind === 'foto'
              ? 'La IA lee la imagen y propone caption + vínculos.'
              : 'Se guarda fechado hoy.'}
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
        className="input-paper w-full resize-none marginalia-script placeholder:italic placeholder:font-sans"
        disabled={composer.isPending}
      />
    </div>
  )
}

function FotoFields({ composer }: { composer: Composer }) {
  return (
    <div className="space-y-3">
      <label
        className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          composer.photoFile
            ? 'border-transparent'
            : 'border-ink-200/60 hover:border-ink-300 hover:bg-paper-50/50'
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f && f.type.startsWith('image/')) {
            composer.changePhotoFile(f)
          }
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => composer.changePhotoFile(e.target.files?.[0] ?? null)}
          disabled={composer.isPending}
        />
        {composer.photoPreviewUrl ? (
          <div className="space-y-2">
            <img
              src={composer.photoPreviewUrl}
              alt="preview"
              className="max-h-64 mx-auto rounded shadow-sm"
            />
            <p className="text-caption text-ink-400 italic">
              Click para cambiar la imagen
            </p>
          </div>
        ) : (
          <div className="text-ink-400">
            <p className="text-sm">
              Arrastra una imagen aquí o click para elegir
            </p>
            <p className="text-caption italic mt-1">
              JPEG / PNG / WebP / GIF · hasta 10 MB
            </p>
          </div>
        )}
      </label>
      <input
        type="text"
        value={composer.photoCaption}
        onChange={(e) => composer.setPhotoCaption(e.target.value)}
        placeholder="Caption (opcional — la IA propondrá uno)"
        className="input-paper w-full"
        disabled={composer.isPending}
      />
      <textarea
        value={composer.photoNote}
        onChange={(e) => composer.setPhotoNote(e.target.value)}
        placeholder="Tu nota sobre la foto (opcional)"
        rows={2}
        className="input-paper w-full resize-none marginalia-script placeholder:italic placeholder:font-sans"
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
