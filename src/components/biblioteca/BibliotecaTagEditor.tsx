import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { LibraryItem } from '../../types/biblioteca'
import { useSetLibraryItemTags } from '../../state'
import { PlusIcon } from '../Icons'
import { CloseButton } from '../CloseButton'

/**
 * Editor de etiquetas del inspector de la Biblioteca (PR-C).
 *
 * Pinta las etiquetas actuales como chips removibles (✕) y un input
 * "Agregar etiqueta…" que añade al presionar Enter. La normalización vive acá:
 * recorta espacios, descarta vacías, dedupe sin distinguir mayúsculas/acentos,
 * y acota a 50 caracteres. Cada cambio llama `useSetLibraryItemTags` con el
 * array NUEVO completo (el hook es optimista sobre `item.tags`).
 *
 * Presentacional salvo la mutación. El estado de verdad son `item.tags`; el
 * único estado local es el texto del input en curso.
 */

const MAX_TAG_LENGTH = 50

/** Normaliza para comparar etiquetas sin distinguir mayúsculas/acentos. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function BibliotecaTagEditor({ item }: { item: LibraryItem }) {
  const setTags = useSetLibraryItemTags()
  const [draft, setDraft] = useState('')
  const tags = item.tags

  function commit(next: string[]) {
    setTags.mutate({ kind: item.kind, itemId: item.itemId, tags: next })
  }

  function addTag() {
    const trimmed = draft.trim().slice(0, MAX_TAG_LENGTH)
    if (!trimmed) return
    // Dedupe case/acento-insensible: si ya existe, no la duplicamos.
    const exists = tags.some((tag) => fold(tag) === fold(trimmed))
    if (!exists) commit([...tags, trimmed])
    setDraft('')
  }

  function removeTag(tag: string) {
    commit(tags.filter((existing) => existing !== tag))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addTag()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-sage-soft)] pl-2.5 pr-1 py-0.5 text-caption text-ink-700"
        >
          {tag}
          <CloseButton
            onClick={() => removeTag(tag)}
            label={`Quitar etiqueta ${tag}`}
            size={11}
            className="touch-target inline-flex size-4 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-200/70 hover:text-ink-700"
          />
        </span>
      ))}

      {/* Input de alta: crece dentro de la fila de chips. */}
      <label className="inline-flex min-w-[8rem] flex-1 items-center gap-1 rounded-full border border-dashed border-ink-200 px-2.5 py-0.5 text-caption focus-ring-within">
        <PlusIcon size={11} className="shrink-0 text-ink-300" />
        <input
          type="text"
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder="Agregar etiqueta…"
          aria-label="Agregar etiqueta"
          // focus-ring-exempt: el label muestra el foco vía el token .focus-ring-within
          className="min-w-0 flex-1 bg-transparent text-ink-700 placeholder:text-ink-300 focus:outline-none"
        />
      </label>
    </div>
  )
}
