import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryItem } from '../../types/biblioteca'
import { useRenameLibraryItem } from '../../state'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { resolveRenamedTitle } from './helpers'

/**
 * Modal para renombrar un archivo de la Biblioteca (PR4).
 *
 * Editorial sobre papel, backdrop con blur. Detalles de UX pedidos:
 *   - el input llega prellenado con el título actual y SELECCIONADO (escribir
 *     reemplaza de una);
 *   - Enter confirma, Escape cancela (Escape lo maneja useModalOverlay);
 *   - valida no-vacío con un error inline sobrio;
 *   - preserva la extensión si el usuario la borró (a.pdf → "b" → b.pdf), vía
 *     `resolveRenamedTitle` (puro, testeado en helpers).
 *
 * La mutación es optimista (useRenameLibraryItem); cerramos al confirmar.
 */
export function RenameModal({
  item,
  open,
  onClose,
}: {
  item: LibraryItem
  open: boolean
  onClose: () => void
}) {
  const rename = useRenameLibraryItem()
  const [value, setValue] = useState(item.title)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const overlay = useModalOverlay({ open, onClose, lockScroll: false })

  // Al abrir: resetear al título actual y seleccionar todo el texto para que
  // empezar a escribir lo reemplace (no haya que borrar a mano).
  useEffect(() => {
    if (!open) return
    setValue(item.title)
    setError(null)
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, item])

  function handleSubmit() {
    if (rename.isPending) return
    const finalTitle = resolveRenamedTitle(item.title, value)
    if (!finalTitle) {
      setError('El nombre no puede estar vacío')
      return
    }
    // Sin cambios reales → cerrar sin tocar la red.
    if (finalTitle === item.title) {
      onClose()
      return
    }
    rename.mutate(
      { kind: item.kind, itemId: item.itemId, displayTitle: finalTitle },
      { onSettled: onClose },
    )
    // Optimista: cerramos ya; el toast de error (si falla) lo muestra el hook.
    onClose()
  }

  if (!open) return null

  return createPortal(
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm cursor-default animate-fade-up motion-reduce:animate-none"
        tabIndex={-1}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none animate-fade-up motion-reduce:animate-none">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-label="Renombrar archivo"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-md bg-paper-50 border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            <p className="section-eyebrow" style={{ color: 'var(--accent-sage)' }}>
              biblioteca
            </p>
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
              Renombrar archivo
            </h3>
          </header>

          <div className="px-5 py-4">
            <label htmlFor="rename-input" className="block section-eyebrow mb-1">
              Nombre
            </label>
            <input
              id="rename-input"
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'rename-error' : undefined}
              className="input-paper w-full text-sm"
              disabled={rename.isPending}
            />
            {error && (
              <p
                id="rename-error"
                className="mt-1.5 text-caption text-[color:var(--accent-clay)]"
              >
                {error}
              </p>
            )}
          </div>

          <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={rename.isPending}
              className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={rename.isPending || !value.trim()}
              className="btn-ink"
            >
              Renombrar
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
