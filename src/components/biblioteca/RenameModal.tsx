import { useEffect, useRef, useState } from 'react'
import type { LibraryItem } from '../../types/biblioteca'
import { useRenameLibraryItem } from '../../state'
import { ModalShell, ModalFooter } from '../ModalShell'
import { Button } from '../Button'
import { resolveRenamedTitle } from './helpers'

/**
 * Modal para renombrar un archivo de la Biblioteca (PR4).
 *
 * Editorial sobre papel, backdrop con blur. Detalles de UX pedidos:
 *   - el input llega prellenado con el título actual y SELECCIONADO (escribir
 *     reemplaza de una);
 *   - Enter confirma, Escape cancela (Escape lo maneja ModalShell);
 *   - valida no-vacío con un error inline sobrio;
 *   - preserva la extensión si el usuario la borró (a.pdf → "b" → b.pdf), vía
 *     `resolveRenamedTitle` (puro, testeado en helpers).
 *
 * La mutación es optimista (useRenameLibraryItem); cerramos al confirmar. El
 * chrome (portal + backdrop + caja + header) lo aporta ModalShell.
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

  return (
    <ModalShell
      ariaLabel="Renombrar archivo"
      eyebrow="biblioteca"
      eyebrowColor="var(--accent-sage)"
      title="Renombrar archivo"
      size="sm"
      onClose={onClose}
      lockScroll={false}
    >
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

      <ModalFooter>
        <Button variant="quiet" onClick={onClose} disabled={rename.isPending}>
          cancelar
        </Button>
        <Button
          variant="ink"
          onClick={handleSubmit}
          disabled={rename.isPending || !value.trim()}
        >
          Renombrar
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
