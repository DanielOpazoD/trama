import { Suspense, lazy, useState } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryItem } from '../../types/biblioteca'
import { canDownloadLibraryItem, libraryItemServeUrl } from '../../api/biblioteca'
import { api } from '../../api'
import { useSetLibraryItemPinned, useToast } from '../../state'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { CloseIcon, DownloadIcon, InfoIcon, PinIcon } from '../Icons'
import { FileTypeIcon } from './FileTypeIcon'
import { BibliotecaInspector } from './BibliotecaInspector'
import {
  fileExtensionLabel,
  fileTypeLabel,
  formatByteSize,
  formatShortDate,
  sourceLabel,
  viewerModeFor,
  type ViewerMode,
} from './helpers'

// pdf.js pesa ~1 MB: el visor de PDF se carga SOLO al abrir un PDF (lazy). Igual
// el de texto, para no inflar el shell. Montar estos componentes es lo que
// dispara su chunk.
const BibliotecaPdfViewer = lazy(() => import('./BibliotecaPdfViewer'))
const BibliotecaTextViewer = lazy(() => import('./BibliotecaTextViewer'))

/**
 * Visor de un archivo de la Biblioteca: un overlay único que abre el item y
 * elige la superficie según su tipo (`viewerModeFor`):
 *
 *   - imagen → la imagen completa, contenida, sobre fondo oscuro (object-URL
 *     autenticado, como el lightbox de Notas/Momentos).
 *   - pdf → visor pdf.js paginado (lazy).
 *   - texto/markdown/JSON → panel de texto desplazable (lazy).
 *   - resto (Office, audio, video, binarios) → sin previsualización posible para
 *     un archivo privado: tarjeta con el ícono, la metadata y un CTA Descargar.
 *
 * Header consistente en todos los modos: título + tira de metadata (extensión,
 * tipo, tamaño, Creado, Modificado, fuente, tags) + acciones (descargar / cerrar).
 * Escape y clic en el fondo cierran (vía `useModalOverlay`).
 */
export function BibliotecaViewer({
  item,
  onClose,
}: {
  item: LibraryItem
  onClose: () => void
}) {
  const overlay = useModalOverlay({ open: true, onClose, lockScroll: true })
  const mode = viewerModeFor(item)
  const serveUrl = libraryItemServeUrl(item)
  const downloadable = canDownloadLibraryItem(item)
  // Inspector "Detalles" (etiquetas + conexiones) — cajón lateral derecho.
  const [inspectorOpen, setInspectorOpen] = useState(false)

  return createPortal(
    <>
      {/* Fondo oscuro. Clic cierra. */}
      <button
        onClick={onClose}
        aria-label="Cerrar visor"
        tabIndex={-1}
        className="fixed inset-0 z-[100] cursor-default animate-fade-up motion-reduce:animate-none"
        style={{
          background:
            'radial-gradient(120% 120% at 50% 40%, rgba(12,12,14,0.92) 0%, rgba(0,0,0,0.97) 70%)',
        }}
      />
      <div
        ref={overlay.dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Visor — ${item.title}`}
        className="fixed inset-0 z-[100] flex flex-col pointer-events-none animate-fade-up motion-reduce:animate-none"
      >
        <ViewerHeader
          item={item}
          downloadable={downloadable}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
          onClose={onClose}
        />

        {/* Contenido — los márgenes dejan pasar el clic al fondo (cerrar). */}
        <div className="flex-1 min-h-0 w-full overflow-hidden pointer-events-none">
          <div className="mx-auto h-full w-full max-w-5xl px-4 pb-4 pointer-events-auto">
            <ViewerBody item={item} mode={mode} serveUrl={serveUrl} onClose={onClose} />
          </div>
        </div>

        {/* Inspector lateral — sobre el fondo, anclado a la derecha del overlay. */}
        <BibliotecaInspector
          item={item}
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
        />
      </div>
    </>,
    document.body,
  )
}

/** Barra superior: título + tira de metadata + fijar + detalles + descargar + cerrar. */
function ViewerHeader({
  item,
  downloadable,
  inspectorOpen,
  onToggleInspector,
  onClose,
}: {
  item: LibraryItem
  downloadable: boolean
  inspectorOpen: boolean
  onToggleInspector: () => void
  onClose: () => void
}) {
  return (
    <div className="pointer-events-auto shrink-0 bg-gradient-to-b from-black/70 to-transparent">
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 pb-4">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 truncate font-serif text-lg text-white/90 leading-snug">
            {item.title}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <PinButton item={item} />
            <button
              type="button"
              onClick={onToggleInspector}
              aria-label="Detalles"
              aria-pressed={inspectorOpen}
              className={`size-9 flex items-center justify-center rounded-full transition-colors ${
                inspectorOpen
                  ? 'bg-white/15 text-white'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <InfoIcon size={18} />
            </button>
            {downloadable && <DownloadButton item={item} />}
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>
        <MetadataStrip item={item} />
      </div>
    </div>
  )
}

/**
 * Botón Fijar / Soltar del header. Relleno con `--accent-sage` cuando el item
 * está fijado; contorno tenue cuando no. Optimista vía `useSetLibraryItemPinned`.
 */
function PinButton({ item }: { item: LibraryItem }) {
  const setPinned = useSetLibraryItemPinned()
  return (
    <button
      type="button"
      onClick={() =>
        setPinned.mutate({ kind: item.kind, itemId: item.itemId, pinned: !item.pinned })
      }
      disabled={setPinned.isPending}
      aria-label={item.pinned ? 'Soltar' : 'Fijar'}
      aria-pressed={item.pinned}
      title={item.pinned ? 'Soltar' : 'Fijar'}
      className="size-9 flex items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-50"
      style={item.pinned ? { color: 'var(--accent-sage)' } : undefined}
    >
      <PinIcon size={17} className={item.pinned ? 'fill-current' : 'text-white/80'} />
    </button>
  )
}

/** Tira de metadata: extensión · tipo · tamaño · Creado · Modificado · fuente · tags. */
function MetadataStrip({ item }: { item: LibraryItem }) {
  const created = formatShortDate(item.createdAt)
  const updated = formatShortDate(item.updatedAt)
  return (
    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-white/55">
      <Meta label="Extensión" value={fileExtensionLabel(item)} />
      <Meta label="Tipo" value={fileTypeLabel(item.fileType)} />
      {item.byteSize !== null && (
        <Meta label="Tamaño" value={formatByteSize(item.byteSize)} />
      )}
      {created && <Meta label="Creado" value={created} />}
      {updated && <Meta label="Modificado" value={updated} />}
      <Meta label="Fuente" value={sourceLabel(item.source)} />
      {item.tags.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Etiquetas</dt>
          {item.tags.map((tag) => (
            <dd key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">
              {tag}
            </dd>
          ))}
        </span>
      )}
    </dl>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <dt className="uppercase tracking-eyebrow text-[0.625rem] text-white/40">
        {label}
      </dt>
      <dd className="text-white/70">{value}</dd>
    </span>
  )
}

/** El cuerpo del visor según el modo resuelto. */
function ViewerBody({
  item,
  mode,
  serveUrl,
  onClose,
}: {
  item: LibraryItem
  mode: ViewerMode
  serveUrl: string | null
  onClose: () => void
}) {
  // Sin URL servible (p. ej. pdf-stamp data-url, o sin storageKey) no hay nada
  // que bajar: cae a la tarjeta de "sin previsualización" + (intento de) descarga.
  if (!serveUrl || mode === 'none') {
    return <NoPreviewCard item={item} onClose={onClose} />
  }

  if (mode === 'image') return <ImageBody serveUrl={serveUrl} alt={item.title} />

  if (mode === 'pdf') {
    return (
      <Suspense fallback={<CenteredHint dark>cargando visor…</CenteredHint>}>
        <BibliotecaPdfViewer serveUrl={serveUrl} />
      </Suspense>
    )
  }

  // mode === 'text'
  const baseMime = item.mimeType?.toLowerCase() ?? ''
  const isJson = baseMime.includes('json') || /\.json$/i.test(item.title)
  return (
    <div className="h-full overflow-hidden rounded-lg border border-white/10">
      <Suspense fallback={<CenteredHint>cargando…</CenteredHint>}>
        <BibliotecaTextViewer serveUrl={serveUrl} isJson={isJson} />
      </Suspense>
    </div>
  )
}

/** Imagen contenida (zoom-to-fit) sobre el fondo oscuro. */
function ImageBody({ serveUrl, alt }: { serveUrl: string; alt: string }) {
  const { src, status } = useAuthenticatedMediaState(serveUrl)
  if (status === 'ready' && src) {
    return (
      <div className="flex h-full items-center justify-center">
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none shadow-2xl shadow-black/60"
        />
      </div>
    )
  }
  return (
    <CenteredHint dark>
      {status === 'error' ? 'No se pudo cargar la imagen' : 'cargando…'}
    </CenteredHint>
  )
}

/**
 * Tarjeta "sin previsualización": para archivos que no se pueden mostrar en el
 * navegador (Office, audio, video, binarios) o que no son servibles. Muestra el
 * ícono de tipo, una explicación honesta y un CTA de descarga — salvo que el
 * archivo tampoco sea descargable (p. ej. una firma data-url de PDF Studio).
 */
function NoPreviewCard({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const downloadable = canDownloadLibraryItem(item)
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-ink-100/80 bg-paper-50 px-6 py-8 text-center shadow-xl shadow-ink-900/25">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-lg border border-ink-100/70 bg-paper-100/50">
          <FileTypeIcon fileType={item.fileType} mimeType={item.mimeType} size={32} />
        </div>
        <p className="font-serif text-lg text-ink-800 leading-snug break-words">
          {item.title}
        </p>
        <p className="mt-2 text-caption text-ink-400">
          {downloadable
            ? 'Este tipo de archivo no se puede previsualizar en el navegador. Descargalo para abrirlo.'
            : 'Este archivo no tiene una previsualización ni una descarga disponible.'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          {downloadable && <DownloadButton item={item} variant="prominent" />}
          <button
            type="button"
            onClick={onClose}
            className="section-eyebrow hover:text-ink-700 transition-colors"
          >
            cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Botón Descargar reutilizado por el header y la tarjeta sin-preview. */
function DownloadButton({
  item,
  variant = 'chrome',
}: {
  item: LibraryItem
  variant?: 'chrome' | 'prominent'
}) {
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)

  async function handleDownload(event: MouseEvent) {
    event.stopPropagation()
    if (downloading) return
    setDownloading(true)
    try {
      await api.biblioteca.download(item)
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo descargar',
        tone: 'error',
      })
    } finally {
      setDownloading(false)
    }
  }

  if (variant === 'prominent') {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="btn-ink inline-flex items-center gap-1.5 disabled:opacity-60"
      >
        <DownloadIcon size={15} />
        <span>Descargar</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      aria-label="Descargar"
      className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      <DownloadIcon size={17} />
    </button>
  )
}

function CenteredHint({
  children,
  dark = false,
}: {
  children: React.ReactNode
  dark?: boolean
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className={`text-caption ${dark ? 'text-white/70' : 'text-ink-400'}`}>
        {children}
      </p>
    </div>
  )
}
