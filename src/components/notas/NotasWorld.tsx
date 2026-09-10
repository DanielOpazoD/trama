import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Page } from '../Page'
import { initHistory, type History } from '../../lib/pdfStudio/model/history'
import { emptyDoc } from '../../lib/pdfStudio/model/model'
import type { PdfDoc } from '../../lib/pdfStudio/model/modelTypes'
import { NotasHomeView } from './NotasHomeView'
import { NotasOmnibox, useNotasOmnibox } from './NotasOmnibox'
import { NotasMobileTabs, NotasSidebar, NotasTopBar } from './NotasWorldChrome'
import { SECTIONS } from './notasSections'
import { PromptsView } from './PromptsView'
import { TareasView } from './TareasView'
import { useModuleVisibility } from '../../hooks/useModuleVisibility'
import { useClampedSection } from '../../hooks/useClampedSection'
import {
  IMPRENTA_HANDOFF_EVENT,
  takeHandedOffImprentaFiles,
} from '../../lib/imprentaHandoff'
import { useTheme } from '../../hooks/useTheme'
import { FeedSkeleton } from './FeedSkeleton'
import { SectionSkeleton } from './SectionSkeleton'
import { SectionPinGate } from '../SectionPinGate'
import type { World } from '../../types/world'
import type { TramaTarget } from '../appShell/worldShellModel'
import type { NotasSection } from '../../types/notas'
import type { CaptureItem, Note, Recorte } from '../../api'
import { requestBlob } from '../../api/request'
import { useToast } from '../../state'
import { recortesToPdfFiles } from '../../lib/pdfStudio/import/recortesToPdfFiles'
import { notesToPdfFiles } from '../../lib/pdfStudio/import/notesToPdfFiles'
import { captureItemsToPdfFiles } from '../../lib/pdfStudio/import/captureItemsToPdfFiles'
import type { SettingsSectionId } from '../settings/settingsModel'

// Lazy: pdf.js (~1MB) y pdf-lib sólo se bajan al entrar a la sección PDF.
const importPdfStudioView = () =>
  import('./pdfStudio/PdfStudioView').then((m) => ({ default: m.PdfStudioView }))

// Una sola importación en vuelo para la precarga y el `lazy`: al drenar archivos
// se piden las dos en el mismo tick. El navegador ya las unifica en su mapa de
// módulos, pero vitest no: con dos `import()` concurrentes de un módulo simulado
// entregó el mock al primero y el módulo REAL al segundo (medido en
// NotasWorld.test), y el test montaba el estudio de verdad. Si la importación
// falla se olvida, para que el próximo intento vuelva a pedirla.
let pdfStudioViewImport: ReturnType<typeof importPdfStudioView> | undefined
function loadPdfStudioView() {
  pdfStudioViewImport ??= importPdfStudioView().catch((error: unknown) => {
    pdfStudioViewImport = undefined
    throw error
  })
  return pdfStudioViewImport
}

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
 * tareas, prompts y claves. El buscador es la misma paleta ⌘K del mundo
 * principal, con notas, tareas y prompts (`NotasOmnibox`).
 */
export function NotasWorld({
  world,
  onChangeWorld,
  initialSection,
  onGoToTrama,
}: {
  world: World
  onChangeWorld: (w: World) => void
  /** Sección con la que abrir (p. ej. al revelar un módulo desde el otro mundo). */
  initialSection?: NotasSection
  /** Cruza a Trama con lo que se eligió en el buscador. */
  onGoToTrama?: (target: TramaTarget) => void
}) {
  const toast = useToast()
  const omnibox = useNotasOmnibox()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // La sección con que se abre Configuración (Favoritos lleva a «Extensión»).
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | null>(null)
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

  const openSettings = useCallback(() => setSettingsOpen(true), [])

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

  // Archivos que llegaron desde el otro mundo (Momentos) por `imprentaHandoff`:
  // se drenan al montar y cada vez que el puente avisa mientras Notas está
  // abierto. Entran por el mismo camino que el resto, con su toast.
  useEffect(() => {
    const drain = () => {
      const files = takeHandedOffImprentaFiles()
      if (files.length > 0) deliverFilesToImprenta({ files, failures: [] })
    }
    drain()
    window.addEventListener(IMPRENTA_HANDOFF_EVENT, drain)
    return () => window.removeEventListener(IMPRENTA_HANDOFF_EVENT, drain)
  }, [deliverFilesToImprenta])

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
        onOpenSearch={omnibox.openOmnibox}
        onOpenSettings={openSettings}
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
        onOpenSearch={omnibox.openOmnibox}
        onOpenSettings={openSettings}
      />

      {/* Contenido */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Imprenta/Planillas son layouts tipo app de ANCHO COMPLETO: reciben el
            topbar como prop y lo montan DENTRO del área de trabajo, para que su
            panel lateral llegue hasta el borde superior. */}
        <div key={section} className="flex h-full flex-col animate-view-fade">
          <SectionPinGate sectionId={`notas:${section}`}>
            {section === 'pdf' || section === 'planillas' ? (
              <Suspense
                fallback={
                  // Imprenta es el único uso del esqueleto FUERA de la columna:
                  // acá la columna se la da quien lo monta.
                  <Page width="workbench" rhythm="none">
                    <SectionSkeleton variant="grid" />
                  </Page>
                }
              >
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
                  onGoToSection={setSection}
                />
              </Suspense>
            ) : (
              <>
                <NotasTopBar section={section} />
                {/* id="main-scroll": el feed virtualizado (useMainScrollVirtualizer)
                  se ata a este contenedor. El mundo trama y el mundo notas son
                  mutuamente excluyentes, así que solo existe un #main-scroll.
                  Es `flex-1`, no `h-full`: con la barra superior como hermana
                  dentro de un padre de bloque, `h-full` lo hacía medir el alto
                  entero empezando 43 px más abajo, y sus últimos 43 px quedaban
                  fuera del recorte de <main> (medido: scroller hasta y=943 con
                  main hasta 900, en las seis secciones). */}
                <div id="main-scroll" className="min-h-0 flex-1 overflow-y-auto">
                  <Page
                    width="workbench"
                    rhythm="none"
                    // Responsive, así que en clases y no en línea. Es el cierre
                    // que había de hecho: `pb-24` ganaba en móvil (96 px) y el
                    // `md:py-10` lo pisaba en escritorio (40 px), comprobado
                    // compilando esas clases con el Tailwind del repo.
                    paddingBottom={null}
                    className="pb-24 md:pb-10"
                    testId="notas-world-content"
                  >
                    {section === 'inicio' && <NotasHomeView onNavigate={setSection} />}
                    {section === 'notas' && (
                      <Suspense fallback={<FeedSkeleton />}>
                        <NotasFeedView
                          onSendImagesToPdf={sendImagesToPdf}
                          onSendNoteToImprenta={sendNoteToImprenta}
                          onSendItemsToImprenta={sendItemsToImprenta}
                          onOpenSettings={(section) => {
                            setSettingsSection(section)
                            setSettingsOpen(true)
                          }}
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
                  </Page>
                </div>
              </>
            )}
          </SectionPinGate>
        </div>
      </main>

      {/* Configuración — el mismo panel del mundo principal, abierto desde el
          chrome de Notas (sidebar en escritorio, fila de tabs en móvil). */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <Settings
            open={settingsOpen}
            onClose={() => {
              setSettingsOpen(false)
              setSettingsSection(null)
            }}
            initialSection={settingsSection ?? undefined}
            theme={theme}
            onSetTheme={setTheme}
          />
        </Suspense>
      )}

      {/* El buscador va después de Configuración: comparten capa (z-40) y decide el
          orden del DOM. Abierto con Configuración a la vista tiene que quedar
          encima, como en Trama; antes quedaba debajo, con el foco y el teclado. */}
      <NotasOmnibox
        open={omnibox.open}
        onClose={omnibox.closeOmnibox}
        onOpenSection={setSection}
        onOpenSettings={openSettings}
        onGoToTrama={onGoToTrama}
      />
    </div>
  )
}
