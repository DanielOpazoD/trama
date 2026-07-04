import { useEffect, useState } from 'react'
import { useModalOverlay } from '../../../../hooks/useModalOverlay'
import { IconButton } from '../../../IconButton'

/**
 * Atajos descubribles del editor de planillas: botón «?» flotante y ⌘/ (o
 * Ctrl+/) abren una hoja de atajos según el modo. Autocontenido: dueño de su
 * estado y su listener, para no engordar PdfTextEditor.
 */
type ShortcutRow = [keys: string, description: string]

const DESIGN_ROWS: ShortcutRow[] = [
  ['⇧ clic', 'Crear un casillero de texto donde haces clic'],
  ['Doble clic', 'Escribir directo dentro del casillero'],
  ['⌘Z · ⇧⌘Z', 'Deshacer · rehacer cambios de casilleros'],
  ['⌘C · ⌘V', 'Copiar y pegar casilleros en la página visible'],
  ['⌘D', 'Duplicar la selección'],
  ['⌘A', 'Seleccionar todos los casilleros'],
  ['Flechas', 'Mover la selección fino (con ⇧, pasos grandes)'],
  ['Supr / Delete', 'Eliminar la selección'],
  ['Alt al arrastrar', 'Mover sin imán de alineación'],
  ['‹ › del inspector', 'Ir al casillero anterior · siguiente'],
  ['Esc', 'Cancelar la colocación pendiente'],
]

const FILL_ROWS: ShortcutRow[] = [
  ['Enter', 'Saltar al siguiente campo (la página te sigue)'],
  ['⇧ Enter', 'Volver al campo anterior'],
  ['Tab', 'Recorrer los campos de la página'],
]

function ShortcutsDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  // Mismo criterio que SignatureCaptureDialog: overlay absolute dentro del
  // panel del estudio; el hook aporta focus-trap, Escape y restauración.
  const overlay = useModalOverlay({ open: true, onClose, lockScroll: false })
  const rows = mode === 'design' ? DESIGN_ROWS : FILL_ROWS
  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-ink-900/20">
      <section
        ref={overlay.dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        className="animate-pdf-panel-in w-[min(92vw,440px)] rounded-md border border-ink-100 bg-paper-50 p-4 shadow-xl shadow-ink-900/20"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-body font-semibold text-ink-800">
            {mode === 'design' ? 'Atajos del diseño de planillas' : 'Atajos del relleno'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-caption text-ink-500 hover:bg-ink-100/60"
          >
            Cerrar
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {rows.map(([keys, description]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="whitespace-nowrap rounded border border-ink-100 bg-paper-100 px-1.5 py-0.5 text-micro font-semibold text-ink-600">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-caption text-ink-600">{description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-micro text-ink-400">
          Abre esta hoja cuando quieras con <kbd className="font-semibold">⌘ /</kbd>
        </p>
      </section>
    </div>
  )
}

type Mode = 'design' | 'fill'

export function PdfStudioShortcutsHelp({ mode }: { mode: Mode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key !== '/' && event.key !== '?') return
      event.preventDefault()
      setOpen((value) => !value)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div className="absolute bottom-3 left-3 z-30">
        <IconButton
          label="Atajos de teclado (⌘/)"
          title="Atajos de teclado (⌘/)"
          onClick={() => setOpen(true)}
          className="h-7 w-7 rounded-full border border-ink-100 bg-paper-50/95 text-caption font-semibold text-ink-500 shadow-sm shadow-ink-900/10 hover:bg-ink-100/60"
        >
          <span aria-hidden="true">?</span>
        </IconButton>
      </div>
      {open ? <ShortcutsDialog mode={mode} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
