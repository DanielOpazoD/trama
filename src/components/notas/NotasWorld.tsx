import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ClavesView } from './ClavesView'
import { NotasGlobalSearch } from './NotasGlobalSearch'
import { NotasHomeView } from './NotasHomeView'
import { NotasMobileTabs, NotasSidebar, NotasTopBar } from './NotasWorldChrome'
import { SECTIONS } from './notasSections'
import { PromptsView } from './PromptsView'
import { TareasView } from './TareasView'
import { useModuleVisibility } from '../../hooks/useModuleVisibility'
import { useClampedSection } from '../../hooks/useClampedSection'
import { useTheme } from '../../hooks/useTheme'
import { LoadingHint } from '../LoadingHint'
import { SectionPinGate } from '../SectionPinGate'
import type { World } from '../../types/world'
import type { NotasSection } from '../../types/notas'
import type { Recorte } from '../../api'
import { requestBlob } from '../../api/request'
import { useToast } from '../../state'
import { recortesToPdfFiles } from '../../lib/pdfStudio/import/recortesToPdfFiles'

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

function preloadNotasSection(section: NotasSection): void {
  if (section === 'notas') void import('./NotasFeedView')
  if (section === 'biblioteca') void import('../BibliotecaView')
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

  useEffect(() => {
    if (!searchOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const sendImagesToPdf = useCallback(
    async (recortes: Recorte[]) => {
      const { files, failures } = await recortesToPdfFiles(recortes, {
        fetchBlob: requestBlob,
      })
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
        setPendingPdfFiles(files)
        preloadPdfStudioView()
        setSection('pdf')
        toast.show({
          message:
            failures.length > 0
              ? `${files.length} de ${files.length + failures.length} imágenes enviadas a Imprenta`
              : `${files.length} ${files.length === 1 ? 'imagen enviada' : 'imágenes enviadas'} a Imprenta`,
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
    [setSection, toast],
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
              <Suspense
                fallback={
                  <div className="py-10 flex justify-center">
                    <LoadingHint
                      text={
                        section === 'planillas'
                          ? 'cargando Planillas'
                          : 'cargando Imprenta'
                      }
                      size="sm"
                    />
                  </div>
                }
              >
                <PdfStudioView
                  externalFiles={section === 'pdf' ? pendingPdfFiles : []}
                  onExternalFilesConsumed={() => setPendingPdfFiles([])}
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
                      <Suspense
                        fallback={
                          <div className="py-10 flex justify-center">
                            <LoadingHint text="cargando Notas" size="sm" />
                          </div>
                        }
                      >
                        <NotasFeedView onSendImagesToPdf={sendImagesToPdf} />
                      </Suspense>
                    )}
                    {section === 'tareas' && <TareasView />}
                    {section === 'prompts' && <PromptsView />}
                    {section === 'claves' && <ClavesView />}
                    {section === 'biblioteca' && (
                      <Suspense
                        fallback={
                          <div className="py-10 flex justify-center">
                            <LoadingHint text="cargando Biblioteca" size="sm" />
                          </div>
                        }
                      >
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

      {/* Buscador global — overlay abierto desde el chrome. */}
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buscar en Notas"
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-ink-900/20 backdrop-blur-sm"
        >
          <div
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
