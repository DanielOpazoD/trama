import { lazy, Suspense, useCallback, useState } from 'react'
import { initHistory, type History } from '../../lib/pdfStudio/model/history'
import { emptyDoc } from '../../lib/pdfStudio/model/model'
import type { PdfDoc } from '../../lib/pdfStudio/model/modelTypes'
import { NotasGlobalSearch } from './NotasGlobalSearch'
import { NotasHomeView } from './NotasHomeView'
import { NotasMobileTabs, NotasSidebar, NotasTopBar } from './NotasWorldChrome'
import { SECTIONS } from './notasSections'
import { PromptsView } from './PromptsView'
import { TareasView } from './TareasView'
import { useModuleVisibility } from '../../hooks/useModuleVisibility'
import { useClampedSection } from '../../hooks/useClampedSection'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { useTheme } from '../../hooks/useTheme'
import { FeedSkeleton } from './FeedSkeleton'
import { SectionSkeleton } from './SectionSkeleton'
import { SectionPinGate } from '../SectionPinGate'
import type { World } from '../../types/world'
import type { NotasSection } from '../../types/notas'
import type { CaptureItem, Note, Recorte } from '../../api'
import { requestBlob } from '../../api/request'
import { useToast } from '../../state'
import { recortesToPdfFiles } from '../../lib/pdfStudio/import/recortesToPdfFiles'
import { notesToPdfFiles } from '../../lib/pdfStudio/import/notesToPdfFiles'
import { captureItemsToPdfFiles } from '../../lib/pdfStudio/import/captureItemsToPdfFiles'

// Lazy: pdf.js (~1MB) y pdf-lib sólo se bajan al entrar a la sección PDF.
const loadPdfStudioView = () =>
  import('./pdfStudio/PdfStudioView').then((m) => ({ default: m.PdfStudioView }))

export function preloadPdfStudioView(): void {
  void loadPdfStudioView()
}

const PdfStudioView = lazy(loadPdfStudioView)
const NotasFeedView = lazy(() =>
  import('./NotasFeedView').then((m) => ({ default: m.NotasFeedView })),
)
// Lazy: la Biblioteca (vista + ~14 componentes + miniaturas autenticadas) solo
// se baja al entrar a la sección, no en el shell del mundo Notas.
const BibliotecaView = lazy(() =>
  import('../BibliotecaView').then((m) => ({ default: m.BibliotecaView })),
)
// El vault de claves vive detrás de un gate de PIN: casi nunca es el primer
// paint del mundo, así que no debe pesar en el chunk base de NotasWorld.
const ClavesView = lazy(() =>
  import('./ClavesView').then((m) => ({ default: m.ClavesView })),
)

function preloadNotasSection(section: NotasSection): void {
  if (section === 'notas') void import('./NotasFeedView')
  if (section === 'biblioteca') void import('../BibliotecaView')
  if (section === 'claves') void import('./ClavesView')
  if (section === 'pdf' || section === 'planillas') preloadPdfStudioView()
}

// Lazy: el panel de Configuración es el mismo del mundo principal. Antes el
// mundo Notas no lo montaba, así que su chrome no podía abrir Configuración.
const Settings = lazy(() => import('../Settings').then((m) => ({ default: m.Settings })))

/**
 * τ-worlds: el mundo "Trama Notas" — un workspace de productividad liviana
 * (apuntes rápidos + tareas), independiente del mapa pero con puentes (p. ej.
 * promover una nota a Momento, en una fase posterior).
 *
 * Arma la sub-barra del mundo y sus secciones funcionales: inicio, notas,
 * tareas, prompts y claves. La búsqueda global se abre desde el chrome (igual
 * que el ⌘K del mundo principal): un acceso en el sidebar/cabecera despliega un
 * overlay, en vez de ocupar una barra fija sobre el contenido.
 */
export function NotasWorld({
  world,
  onChangeWorld,
  initialSection,
}: {
  world: World
  onChangeWorld: (w: World) => void
  /** Sección con la que abrir (p. ej. al revelar un módulo desde el otro mundo). */
  initialSection?: NotasSection
}) {
  const toast = useToast()
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pendingPdfFiles, setPendingPdfFiles] = useState<File[]>([])
  // El documento de Imprenta vive AQUÍ, no dentro de PdfStudioView: el estudio
  // se desmonta al salir de su sección (`key={section}` más abajo), así que un
  // estado interno se destruiría al volver a Notas y el siguiente recorte
  // enviado empezaría un documento desde cero en lugar de sumarle páginas.
  // Planillas no lo comparte: sus plantillas se abren de la nube, no se
  // acumulan, y mezclar ambos documentos sería confundir dos flujos.
  const [imprentaHistory, setImprentaHistory] = useState<History<PdfDoc>>(() =>
    initHistory(emptyDoc()),
  )
  const { theme, setTheme } = useTheme()
  const { isVisible } = useModuleVisibility()
  // La sección activa se clampa a Inicio si deja de ser visible (anti-trampa).
  const [section, setSection] = useClampedSection<NotasSection>(
    initialSection ?? 'inicio',
    'inicio',
    isVisible,
  )
  // La activa se lista aunque esté oculta (navegar a ella no la revela, pero el
  // nav debe mostrarla mientras estás parado ahí). OJO: `section` tiene que
  // estar declarada ANTES de este filter — el callback corre síncrono y, con
  // alguna sección oculta, evalúa `s.id === section` (TDZ si viene después).
  const visibleSections = SECTIONS.filter((s) => isVisible(s.id) || s.id === section)

  // El buscador global es un diálogo modal: foco atrapado en el panel, Escape
  // por el stack de overlays (compone con nidos y restaura el foco) y
  // scroll-lock del shell de fondo. Mismo patrón que el ⌘K del mundo principal.
  const searchOverlay = useModalOverlay({
    open: searchOpen,
    onClose: () => setSearchOpen(false),
  })

  // Cola común de entrega a Imprenta: recortes, una nota o una selección
  // mixta llegan por adaptadores distintos y desembocan acá con el mismo
  // contrato { files, failures }.
  const deliverFilesToImprenta = useCallback(
    ({ files, failures }: { files: File[]; failures: Array<{ reason: string }> }) => {
      if (files.length === 0) {
        toast.show({
          message:
            failures.length > 0
              ? 'No se pudo enviar ninguna imagen a Imprenta'
              : 'No hay imágenes para enviar a Imprenta',
          tone: 'error',
        })
        return
      }
      try {
        // Cuántas páginas hay YA: sumar a un documento en curso sin decirlo
        // desorienta tanto como reemplazarlo. El destino se nombra explícito.
        const yaHabia = imprentaHistory.present.pages.length
        const enviadas =
          failures.length > 0
            ? `${files.length} de ${files.length + failures.length} imágenes`
            : `${files.length} ${files.length === 1 ? 'imagen' : 'imágenes'}`
        setPendingPdfFiles(files)
        preloadPdfStudioView()
        setSection('pdf')
        toast.show({
          message:
            yaHabia > 0
              ? `${enviadas} al documento en curso (tenía ${yaHabia} ${yaHabia === 1 ? 'página' : 'páginas'})`
              : `${enviadas} ${files.length === 1 && failures.length === 0 ? 'enviada' : 'enviadas'} a Imprenta`,
          tone: failures.length > 0 ? 'default' : 'success',
        })
      } catch (error) {
        toast.show({
          message:
            error instanceof Error
              ? error.message
              : 'No se pudieron enviar las imágenes a Imprenta',
          tone: 'error',
        })
      }
    },
    [imprentaHistory, setSection, toast],
  )

  const sendImagesToPdf = useCallback(
    async (recortes: Recorte[]) => {
      deliverFilesToImprenta(
        await recortesToPdfFiles(recortes, { fetchBlob: requestBlob }),
      )
    },
    [deliverFilesToImprenta],
  )

  // Nota individual: la acción "Fotos a Imprenta" del menú de la tarjeta.
  const sendNoteToImprenta = useCallback(
    async (note: Note) => {
      deliverFilesToImprenta(await notesToPdfFiles([note], { fetchBlob: requestBlob }))
    },
    [deliverFilesToImprenta],
  )

  // Selección mixta del feed (notas + capturas), en orden del feed.
  const sendItemsToImprenta = useCallback(
    async (items: CaptureItem[]) => {
      deliverFilesToImprenta(
        await captureItemsToPdfFiles(items, { fetchBlob: requestBlob }),
      )
    },
    [deliverFilesToImprenta],
  )

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden">
      <NotasSidebar
        world={world}
        section={section}
        sections={visibleSections}
        onChangeWorld={onChangeWorld}
        onChangeSection={setSection}
        onSectionIntent={preloadNotasSection}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      <NotasMobileTabs
        world={world}
        section={section}
        sections={visibleSections}
        onChangeWorld={onChangeWorld}
        onChangeSection={setSection}
        onSectionIntent={preloadNotasSection}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Contenido */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Imprenta/Planillas son layouts tipo app de ANCHO COMPLETO: reciben el
            topbar como prop y lo montan DENTRO del área de trabajo, para que su
            panel lateral llegue hasta el borde superior. */}
        <div key={section} className="h-full animate-view-fade">
          <SectionPinGate sectionId={`notas:${section}`}>
            {section === 'pdf' || section === 'planillas' ? (
              <Suspense fallback={<SectionSkeleton variant="grid" />}>
                <PdfStudioView
                  externalFiles={section === 'pdf' ? pendingPdfFiles : []}
                  onExternalFilesConsumed={() => setPendingPdfFiles([])}
                  documentHistory={
                    section === 'pdf'
                      ? { history: imprentaHistory, setHistory: setImprentaHistory }
                      : undefined
                  }
                  topBar={<NotasTopBar section={section} />}
                  studioMode={section === 'planillas' ? 'templates' : 'editor'}
                />
              </Suspense>
            ) : (
              <>
                <NotasTopBar section={section} />
                {/* id="main-scroll": el feed virtualizado (useMainScrollVirtualizer)
                  se ata a este contenedor. El mundo trama y el mundo notas son
                  mutuamente excluyentes, así que solo existe un #main-scroll. */}
                <div id="main-scroll" className="h-full overflow-y-auto">
                  <div
                    data-testid="notas-world-content"
                    className="px-5 md:px-8 pb-24 mx-auto py-8 md:py-10 max-w-5xl"
                  >
                    {section === 'inicio' && <NotasHomeView onNavigate={setSection} />}
                    {section === 'notas' && (
                      <Suspense fallback={<FeedSkeleton />}>
                        <NotasFeedView
                          onSendImagesToPdf={sendImagesToPdf}
                          onSendNoteToImprenta={sendNoteToImprenta}
                          onSendItemsToImprenta={sendItemsToImprenta}
                        />
                      </Suspense>
                    )}
                    {section === 'tareas' && <TareasView />}
                    {section === 'prompts' && <PromptsView />}
                    {section === 'claves' && (
                      <Suspense fallback={<SectionSkeleton />}>
                        <ClavesView />
                      </Suspense>
                    )}
                    {section === 'biblioteca' && (
                      <Suspense fallback={<SectionSkeleton variant="grid" />}>
                        <BibliotecaView
                          onSendToImprenta={(files) => {
                            // Mismo camino que `sendImagesToPdf` (capturas): los
                            // File ya vienen armados por la barra de selección;
                            // acá solo los enrutamos al estudio PDF.
                            setPendingPdfFiles(files)
                            preloadPdfStudioView()
                            setSection('pdf')
                          }}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
              </>
            )}
          </SectionPinGate>
        </div>
      </main>

      {/* Buscador global — diálogo modal abierto desde el chrome. El backdrop
          cierra al clic; el panel atrapa el foco (useModalOverlay) y recaptura
          el clic. */}
      {searchOpen && (
        <div
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-ink-900/20 backdrop-blur-sm"
        >
          <div
            ref={searchOverlay.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Buscar en Notas"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-3 animate-fade-up"
          >
            <NotasGlobalSearch
              autoFocus
              onNavigate={(s) => {
                setSection(s)
                setSearchOpen(false)
              }}
            />
          </div>
        </div>
      )}

      {/* Configuración — el mismo panel del mundo principal, abierto desde el
          chrome de Notas (sidebar en escritorio, fila de tabs en móvil). */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <Settings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            theme={theme}
            onSetTheme={setTheme}
          />
        </Suspense>
      )}
    </div>
  )
}
