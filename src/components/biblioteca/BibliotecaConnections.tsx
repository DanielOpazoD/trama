import { useMemo, useState } from 'react'
import type { LibraryItem } from '../../types/biblioteca'
import { useLibraryItemLinks, useRemoveLibraryItemLink } from '../../state'
import { CloseIcon, PlusIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { LinkTargetIcon } from './LinkTargetIcon'
import { BibliotecaLinkPicker } from './BibliotecaLinkPicker'

/**
 * Sección "Aparece en" del inspector (PR-C): las conexiones del archivo con
 * objetos de dominio (entidad / nota / momento).
 *
 * Lista cada vínculo con su ícono por tipo + título (`targetTitle`, o
 * "(sin título)" si el destino se borró) + un ✕ para quitarlo. Un botón
 * "Conectar…" abre el {@link BibliotecaLinkPicker}. Estado de carga discreto y
 * vacío explícito ("Sin conexiones todavía.").
 *
 * Los datos vienen de `useLibraryItemLinks`; quitar usa
 * `useRemoveLibraryItemLink`. El picker recibe las claves ya vinculadas para no
 * ofrecer duplicados.
 */
export function BibliotecaConnections({
  item,
  enabled = true,
}: {
  item: LibraryItem
  /** Difiere la query de conexiones hasta que el inspector esté abierto. */
  enabled?: boolean
}) {
  const links = useLibraryItemLinks(item.kind, item.itemId, enabled)
  const removeLink = useRemoveLibraryItemLink()
  const [pickerOpen, setPickerOpen] = useState(false)

  const linkedKeys = useMemo(
    () => new Set((links.data ?? []).map((l) => `${l.targetKind}:${l.targetId}`)),
    [links.data],
  )

  const items = links.data ?? []

  return (
    <div className="space-y-2">
      {links.isLoading ? (
        <p className="text-caption text-ink-400">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-caption text-ink-400">Sin conexiones todavía.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((link) => (
            <li
              key={link.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-100/40"
            >
              <LinkTargetIcon
                kind={link.targetKind}
                size={14}
                className="shrink-0 text-ink-400"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                {link.targetTitle ?? '(sin título)'}
              </span>
              <IconButton
                onClick={() =>
                  removeLink.mutate({
                    kind: item.kind,
                    itemId: item.itemId,
                    targetKind: link.targetKind,
                    targetId: link.targetId,
                  })
                }
                disabled={removeLink.isPending}
                label={`Quitar conexión con ${link.targetTitle ?? 'destino sin título'}`}
                className="touch-target inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-300 opacity-100 transition-colors hover:bg-ink-200/70 hover:text-ink-700 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              >
                <CloseIcon size={12} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption text-ink-500 transition-colors hover:bg-ink-100/60 hover:text-ink-700"
      >
        <PlusIcon size={13} />
        Conectar…
      </button>

      {pickerOpen && (
        <BibliotecaLinkPicker
          item={item}
          linkedKeys={linkedKeys}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
