import { useState, type FormEvent, type ReactNode } from 'react'
import type { useMomentoComposer } from './useMomentoComposer'
import { MomentoQRModal } from './MomentoQRModal'
import { AudioPicker } from './AudioPicker'
import { MomentoKindTabs } from './MomentoKindTabs'
import { editImage } from '../../lib/imageEditor'
import { PencilIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { VideoPlayBadge } from './VideoPlayBadge'
import { InlineLoadingLabel } from '../InlineLoadingLabel'

type Composer = ReturnType<typeof useMomentoComposer>

/** Sustantivo del contador de la grilla: "foto(s)" si todo son imágenes,
 *  "elemento(s)" en cuanto hay algún video (no llamar "foto" a un clip). */
function mediaNoun(drafts: { isVideo: boolean }[]): string {
  const plural = drafts.length !== 1
  if (drafts.some((d) => d.isVideo)) return plural ? 'elementos' : 'elemento'
  return plural ? 'fotos' : 'foto'
}

/**
 * Form de captura de un nuevo Momento. Toda la state vive en el hook
 * `useMomentoComposer` — este archivo es presentación pura. Las tres
 * branches por kind son sub-componentes internos (NotaFields,
 * RecorteFields, FotoFields) porque conviven y se intercambian con
 * el toggle de arriba; separarlos en archivos sumaría ruido sin
 * dar reuso.
 */
export function MomentoComposer({
  composer,
  defaultExpanded = false,
}: {
  composer: Composer
  /** Arrancar ya expandido (p. ej. tras una acción explícita de "nueva entrada"). */
  defaultExpanded?: boolean
}) {
  // τ-mobile-bridge: state local del modal QR. Vive acá adentro porque
  // el botón vive en este componente y no hay otro lugar que necesite
  // saber si está abierto.
  const [qrOpen, setQrOpen] = useState(false)
  // El composer arranca COLAPSADO (una línea) para no dominar el alto de la
  // vista: la línea de tiempo sube al primer pantallazo. Se expande al clickear.
  const [expanded, setExpanded] = useState(defaultExpanded)

  const question =
    composer.kind === 'nota'
      ? '¿Qué viste, leíste o pensaste hoy?'
      : composer.kind === 'recorte'
        ? 'Algo del mundo que te llamó la atención'
        : 'Una imagen del día'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    composer.submit()
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Escribir un nuevo momento"
        className="mb-4 w-full p-2.5 bg-paper-100/40 border border-ink-100/60 rounded-lg text-left flex items-baseline gap-2.5 hover:border-ink-200 transition-colors animate-fade-up"
      >
        <span
          className="section-eyebrow-serif shrink-0"
          style={{ color: 'var(--accent-gold)' }}
        >
          nueva entrada
        </span>
        <span className="font-serif text-base italic text-ink-400 truncate">
          {question}
        </span>
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      // AA-A: aún más apretado — p-2.5 + space-y-1.5 + header pb-1.5
      // + rounded-lg (era xl). El composer ahora tiene la silueta de
      // un input grande, no una card-page.
      className="mb-4 p-2.5 bg-paper-100/40 border border-ink-100/60 rounded-lg space-y-1.5 animate-fade-up"
    >
      <header className="pb-1.5 border-b border-ink-100/60 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
            nueva entrada
          </p>
          <h3 className="font-serif text-lg text-ink-800 leading-tight">{question}</h3>
        </div>
        {/* τ-mobile-bridge: botón QR — solo se muestra cuando el kind
            es Foto, porque ese es el caso donde tener el celular a
            mano cambia el flujo. Para nota/recorte el desktop alcanza. */}
        {composer.kind === 'foto' && (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="section-eyebrow hover:text-ink-700 transition-colors shrink-0 flex items-center gap-1.5"
            title="Escanear QR para abrir el composer en el celular"
            aria-label="Abrir en el celular vía QR"
          >
            <QRGlyph />
            <span>celular</span>
          </button>
        )}
      </header>

      <MomentoKindTabs kind={composer.kind} onChange={composer.setKind} />

      {composer.kind === 'nota' && <NotaFields composer={composer} />}
      {composer.kind === 'recorte' && <RecorteFields composer={composer} />}
      {composer.kind === 'foto' && <FotoFields composer={composer} />}

      <MomentoQRModal open={qrOpen} onClose={() => setQrOpen(false)} />

      {/* Save primario del composer — usa btn-accent para distinguirlo
          de "cancelar/cerrar" (text-only, ink-400). El text-xs + py-1.5
          mantiene la silueta compacta original. */}
      <div className="flex justify-end pt-0">
        <button
          type="submit"
          disabled={composer.isPending}
          className="btn-accent text-xs py-1.5"
        >
          {composer.photoUploading
            ? 'subiendo…'
            : composer.isPending
              ? 'guardando…'
              : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function NotaFields({ composer }: { composer: Composer }) {
  return (
    <textarea
      value={composer.noteDraft}
      onChange={(e) => composer.setNoteDraft(e.target.value)}
      placeholder="Una observación, una idea, un recuerdo del día…"
      aria-label="Nota del momento"
      rows={3}
      className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
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
          aria-label="URL del recorte"
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
          {composer.previewing ? <InlineLoadingLabel text="leyendo" /> : '↻ leer'}
        </button>
      </div>
      <input
        type="text"
        value={composer.recorteTitle}
        onChange={(e) => composer.setRecorteTitle(e.target.value)}
        placeholder="Título"
        aria-label="Título del recorte"
        className="input-paper w-full"
        disabled={composer.isPending}
      />
      <textarea
        value={composer.recorteBody}
        onChange={(e) => composer.setRecorteBody(e.target.value)}
        placeholder="Texto del recorte (el tweet, el párrafo, lo que pegues)"
        aria-label="Texto del recorte"
        rows={3}
        className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
        disabled={composer.isPending}
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={composer.recorteAuthor}
          onChange={(e) => composer.setRecorteAuthor(e.target.value)}
          placeholder="Autor (opcional)"
          aria-label="Autor"
          className="input-paper flex-1"
          disabled={composer.isPending}
        />
        <input
          type="text"
          value={composer.recorteSource}
          onChange={(e) => composer.setRecorteSource(e.target.value)}
          placeholder="Fuente (Twitter, blog…)"
          aria-label="Fuente"
          className="input-paper flex-1"
          disabled={composer.isPending}
        />
      </div>
      <textarea
        value={composer.recorteNote}
        onChange={(e) => composer.setRecorteNote(e.target.value)}
        placeholder="Tu nota: por qué te llamó la atención"
        aria-label="Nota del recorte"
        rows={2}
        // Mismo tipo de fuente que usa la nota — coherencia tipográfica
        // entre los 3 kinds de entrada. La marginalia decorativa vive en
        // el RENDER del momento, no en el input crudo.
        className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
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
          const files = Array.from(e.dataTransfer.files ?? []).filter(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
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
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          aria-label="Agregar fotos o videos"
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
                      isPrimary ? 'border-2' : 'border-ink-100/60'
                    } bg-paper-100/40`}
                    style={isPrimary ? { borderColor: 'var(--accent-gold)' } : undefined}
                  >
                    {draft.isVideo ? (
                      <>
                        <video
                          src={draft.previewUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          aria-label={`video ${idx + 1}`}
                        />
                        <VideoPlayBadge size="sm" />
                      </>
                    ) : (
                      <img
                        src={draft.previewUrl}
                        alt={`foto ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    )}
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
                    {/* Editar con el editor de imágenes (recortar/girar/texto).
                        Solo para fotos: el editor no opera sobre video. */}
                    {!draft.isVideo && (
                      <IconButton
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const edited = await editImage(draft.file, {
                            outputType: 'image/jpeg',
                            title: `foto ${idx + 1}`,
                          })
                          if (edited && edited !== draft.file) {
                            composer.replacePhotoDraft(idx, edited)
                          }
                        }}
                        className="absolute top-1 right-7 size-5 flex items-center justify-center rounded-full bg-ink-900/70 text-paper-50 hover:bg-ink-900 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        label={`Editar foto ${idx + 1}`}
                        title="Editar foto"
                        disabled={composer.isPending}
                      >
                        <PencilIcon size={11} />
                      </IconButton>
                    )}
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
                    {/* ψ-photos-rich: flechas ◄ ► para reordenar.
                        Se ocultan en bordes (◄ en idx=0, ► en última). */}
                    {composer.photoDrafts.length > 1 && (
                      <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              composer.movePhoto(idx, -1)
                            }}
                            className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-caption hover:bg-ink-900/85 transition-colors leading-none"
                            aria-label={`Mover foto ${idx + 1} hacia atrás`}
                            title="Mover atrás"
                            disabled={composer.isPending}
                          >
                            ‹
                          </button>
                        )}
                        {idx < composer.photoDrafts.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              composer.movePhoto(idx, 1)
                            }}
                            className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-caption hover:bg-ink-900/85 transition-colors leading-none"
                            aria-label={`Mover foto ${idx + 1} hacia adelante`}
                            title="Mover adelante"
                            disabled={composer.isPending}
                          >
                            ›
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* ω-A: counts/hints sin italic — son metadata útil. El sustantivo
                pasa a "elemento(s)" si hay algún video en la selección. */}
            <p className="text-caption text-ink-400">
              {composer.photoDrafts.length} {mediaNoun(composer.photoDrafts)}
              {composer.photoDrafts.length > 1 &&
                ' · pasa el cursor sobre una y elige "★ portada" para fijarla primero'}
              {composer.photoDrafts.length === 1 && ' · click para agregar más'}
            </p>
          </div>
        ) : (
          <div className="text-ink-400">
            <p className="text-body">
              Arrastra fotos o videos aquí, o haz click para elegir
            </p>
            <p className="text-caption italic mt-1">
              Fotos JPEG / PNG / WebP / GIF · videos MP4 / WebM / MOV hasta 200 MB
            </p>
          </div>
        )}
      </label>
      {/* υ-multi: progreso del upload. Aparece sólo cuando hay
          múltiples archivos en proceso — para un solo file el botón
          "Subiendo…" ya alcanza. */}
      {composer.photoUploadProgress && composer.photoUploadProgress.total > 1 && (
        <p className="text-caption text-ink-400 tabular-nums">
          Subiendo {composer.photoUploadProgress.done} de{' '}
          {composer.photoUploadProgress.total}…
        </p>
      )}
      {(composer.photoDrafts.length > 0 || composer.photoCapturedAtSuggestion) && (
        <div className="rounded-lg border border-ink-100/70 bg-paper-50/55 p-2.5 space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                {composer.photoCapturedAtSuggestion
                  ? 'fecha detectada'
                  : 'fecha de la foto no disponible'}
              </p>
              <p className="text-caption text-ink-500">
                {composer.photoCapturedAtSuggestion
                  ? formatDetectedPhotoDate(composer.photoCapturedAtSuggestion)
                  : 'Puedes usar ahora o elegir una fecha personalizada antes de guardar.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <PhotoDateButton
                active={composer.photoDateMode === 'photo'}
                disabled={!composer.photoCapturedAtSuggestion}
                onClick={() => composer.setPhotoDateMode('photo')}
              >
                {composer.photoCapturedAtSuggestion
                  ? 'Usar fecha de la foto'
                  : 'Fecha de la foto no disponible'}
              </PhotoDateButton>
              <PhotoDateButton
                active={composer.photoDateMode === 'now'}
                onClick={() => composer.setPhotoDateMode('now')}
              >
                Usar ahora
              </PhotoDateButton>
              <PhotoDateButton
                active={composer.photoDateMode === 'custom'}
                onClick={() => composer.setPhotoDateMode('custom')}
              >
                Elegir fecha personalizada
              </PhotoDateButton>
            </div>
          </div>
          {composer.photoDateMode === 'custom' && (
            <label
              htmlFor="composer-custom-photo-date"
              className="block text-caption text-ink-500"
            >
              Fecha personalizada
              <input
                id="composer-custom-photo-date"
                type="datetime-local"
                value={composer.customPhotoCapturedAt}
                onChange={(e) => composer.setCustomPhotoCapturedAt(e.target.value)}
                className="input-paper mt-1 w-full max-w-xs"
                disabled={composer.isPending}
              />
            </label>
          )}
        </div>
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
        aria-label="Título del episodio"
        className="input-paper w-full font-serif text-lead leading-relaxed placeholder:italic"
        disabled={composer.isPending}
      />
      <textarea
        value={composer.photoNote}
        onChange={(e) => composer.setPhotoNote(e.target.value)}
        placeholder="Tu nota sobre el momento (opcional)"
        aria-label="Nota del momento"
        rows={2}
        className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
        disabled={composer.isPending}
      />
      <AudioPicker
        previewSrc={composer.audioDraft?.previewUrl ?? null}
        onPick={composer.setAudioFile}
        onClear={composer.clearAudio}
        disabled={composer.isPending}
      />
    </div>
  )
}

function PhotoDateButton({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-micro uppercase tracking-eyebrow transition-colors ${
        disabled
          ? 'border border-ink-100 text-ink-300 cursor-not-allowed'
          : active
            ? 'bg-ink-800 text-paper-50'
            : 'border border-ink-100 text-ink-400 hover:text-ink-700 hover:border-ink-200'
      }`}
    >
      {children}
    </button>
  )
}

function formatDetectedPhotoDate(value: string): string {
  const [date, time] = value.split('T')
  return `${date ?? value}${time ? ` · ${time.slice(0, 5)}` : ''}`
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
