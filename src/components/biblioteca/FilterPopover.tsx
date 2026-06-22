import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPopover } from '../../hooks/useAnchoredPopover'
import {
  ChatBubbleIcon,
  CheckIcon,
  FilterIcon,
  ScissorsIcon,
  SparkleIcon,
  TrashIcon,
  UploadIcon,
} from '../Icons'
import type { LibraryFileType, LibrarySource } from '../../types/biblioteca'
import { FileTypeIcon } from './FileTypeIcon'

/**
 * Popover de filtros de la Biblioteca: un botón "Filtros" (con badge del número
 * de filtros activos) que abre un panel portado a `document.body` —mismo
 * lenguaje que OverflowMenu: `position: fixed`, cierre con Escape / clic afuera,
 * recálculo de ancla en scroll/resize— vía `useAnchoredPopover`.
 *
 * Dos secciones de selección única, cada una con su opción activa "limpiable"
 * (volver a clickearla la deselecciona):
 *   - Fuente (subido / generado / capturado / whatsapp)
 *   - Tipo de archivo (image / document / spreadsheet / presentation / pdf /
 *     audio / video / other)
 *
 * Presentacional: recibe los valores actuales y emite `onChangeTipo` /
 * `onChangeFuente` / `onToggleEliminados`; el estado (y su espejo en la URL)
 * vive en el orquestador.
 *
 * Al final, tras un separador, "Eliminados recientemente" (PR4): alterna la
 * vista papelera (`incluyeEliminados`). Cuando está activa, el badge del botón
 * lo cuenta también para que se note que hay un filtro especial puesto.
 */

const FUENTE_OPTIONS: ReadonlyArray<{
  value: LibrarySource
  label: string
  icon: ReactNode
}> = [
  { value: 'subido', label: 'Subidos', icon: <UploadIcon size={14} /> },
  { value: 'generado', label: 'Generados', icon: <SparkleIcon size={14} /> },
  { value: 'capturado', label: 'Capturados', icon: <ScissorsIcon size={14} /> },
  { value: 'whatsapp', label: 'WhatsApp', icon: <ChatBubbleIcon size={14} /> },
]

const TIPO_OPTIONS: ReadonlyArray<{ value: LibraryFileType; label: string }> = [
  { value: 'image', label: 'Imágenes' },
  { value: 'document', label: 'Documentos' },
  { value: 'spreadsheet', label: 'Hojas de cálculo' },
  { value: 'presentation', label: 'Presentaciones' },
  { value: 'pdf', label: 'PDF' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Otros' },
]

/** Fila de opción: ícono a la izquierda, etiqueta, check a la derecha si activa. */
function OptionRow({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string
  icon: ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
        selected
          ? 'text-ink-800 bg-ink-100/60'
          : 'text-ink-600 hover:text-ink-800 hover:bg-ink-100/40'
      }`}
    >
      <span className="text-ink-400 shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {selected && (
        <CheckIcon size={14} className="text-[color:var(--accent-sage)] shrink-0" />
      )}
    </button>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pt-2 pb-1 text-micro uppercase tracking-eyebrow text-ink-400">
      {children}
    </p>
  )
}

export function FilterPopover({
  tipo,
  fuente,
  incluyeEliminados,
  onChangeTipo,
  onChangeFuente,
  onToggleEliminados,
}: {
  tipo: LibraryFileType | ''
  fuente: LibrarySource | ''
  incluyeEliminados: boolean
  onChangeTipo: (next: LibraryFileType | '') => void
  onChangeFuente: (next: LibrarySource | '') => void
  onToggleEliminados: (next: boolean) => void
}) {
  // offset chico: el panel queda pegado al botón de filtros (antes se sentía
  // "demasiado abajo" con el gap por defecto).
  const popover = useAnchoredPopover({ offset: 2 })
  const activeCount = (tipo ? 1 : 0) + (fuente ? 1 : 0) + (incluyeEliminados ? 1 : 0)

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        aria-label="Filtros"
        className={`relative inline-flex items-center justify-center size-8 rounded-md transition-colors ${
          activeCount > 0 || popover.open
            ? 'text-ink-700 bg-ink-50'
            : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'
        }`}
      >
        <FilterIcon size={16} />
        {activeCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-ink-700 text-paper-50 text-[10px] font-medium leading-none tabular-nums"
          >
            {activeCount}
          </span>
        )}
      </button>

      {popover.open &&
        popover.position &&
        createPortal(
          <div
            ref={popover.layerRef}
            role="menu"
            aria-label="Filtros"
            style={{
              position: 'fixed',
              top: popover.position.top,
              bottom: popover.position.bottom,
              right: popover.position.right,
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 50,
            }}
            className="w-56 paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-1.5 animate-fade-up"
          >
            <SectionLabel>Fuente</SectionLabel>
            {FUENTE_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={fuente === opt.value}
                onClick={() => onChangeFuente(fuente === opt.value ? '' : opt.value)}
              />
            ))}

            <div className="my-1 border-t border-ink-100/70" />

            <SectionLabel>Tipo de archivo</SectionLabel>
            {TIPO_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                label={opt.label}
                icon={<FileTypeIcon fileType={opt.value} size={14} />}
                selected={tipo === opt.value}
                onClick={() => onChangeTipo(tipo === opt.value ? '' : opt.value)}
              />
            ))}

            <div className="my-1 border-t border-ink-100/70" />

            {/* Papelera (PR4): vista de items ocultos a nivel Biblioteca. */}
            <OptionRow
              label="Eliminados recientemente"
              icon={<TrashIcon size={14} />}
              selected={incluyeEliminados}
              onClick={() => onToggleEliminados(!incluyeEliminados)}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
