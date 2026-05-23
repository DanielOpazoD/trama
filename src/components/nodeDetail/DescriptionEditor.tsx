import { useEffect, useState } from 'react'
import { useAsk, useUpdateEntity } from '../../state'
import type { Entity } from '../../types'
import { SparkleIcon } from '../Icons'

// Tipos donde un link de Spotify tiene sentido (banda, músico, álbum, etc.).
// Si la entidad no es de estos tipos, el input de URL se oculta.
const SPOTIFY_TYPES = new Set([
  'banda', 'musico', 'cancion', 'album', 'disco', 'artista',
])

/**
 * Editor del bloque "descripción + Spotify URL" del panel de detalle.
 *
 * Maneja su propio drafting state. El botón "IA" usa /api/ask para
 * proponer una frase corta (≤15 palabras) que llena el textarea — el
 * usuario revisa y guarda.
 *
 * En modo vista (no editing), muestra la descripción + un botón "editar"
 * que destapa el form.
 */
export function DescriptionEditor({ entity }: { entity: Entity }) {
  const updateEntity = useUpdateEntity()
  const askLLM = useAsk()

  const [editing, setEditing] = useState(false)
  const [descDraft, setDescDraft] = useState(entity.description ?? '')
  const [urlDraft, setUrlDraft] = useState(entity.spotifyUrl ?? '')

  // Sincronizar drafts cuando cambia la entidad (p.ej. el usuario abre otro
  // panel sin desmontar este — pasa cuando se navega entre entidades vía
  // las conexiones).
  useEffect(() => {
    setDescDraft(entity.description ?? '')
    setUrlDraft(entity.spotifyUrl ?? '')
  }, [entity.id, entity.description, entity.spotifyUrl])

  const allowsSpotify = SPOTIFY_TYPES.has(entity.type)

  async function handleSuggestDescription() {
    if (askLLM.isPending) return
    const meta = [
      entity.type,
      entity.year !== undefined ? `año ${entity.year}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const prompt = `Genera UNA descripción breve para "${entity.name}" (${meta}). Máximo 15 palabras. Sin comillas, sin punto final, sin "es un/una". Solo la frase descriptiva.`
    try {
      const res = await askLLM.mutateAsync({ text: prompt, view: 'entidades' })
      const text = res.reply.trim().replace(/^["']|["']$/g, '')
      if (text) setDescDraft(text)
    } catch {
      /* surfaces via askLLM.error si quisiéramos mostrarlo */
    }
  }

  async function handleSave() {
    const desc = descDraft.trim()
    const url = urlDraft.trim()
    const patch: Parameters<typeof updateEntity.mutate>[0]['patch'] = {}
    if ((entity.description ?? '') !== desc) {
      patch.description = desc ? desc : null
    }
    if ((entity.spotifyUrl ?? '') !== url) {
      patch.spotifyUrl = url ? url : null
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    try {
      await updateEntity.mutateAsync({ id: entity.id, patch })
      setEditing(false)
    } catch {
      // error surfaces via updateEntity.error
    }
  }

  if (editing) {
    return (
      <section>
        <div className="space-y-2">
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            placeholder="descripción"
            rows={3}
            className="input-paper w-full resize-none"
          />
          {allowsSpotify && (
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://open.spotify.com/…"
              className="input-paper w-full text-sm"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleSuggestDescription}
              disabled={askLLM.isPending}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-ink-100 hover:bg-ink-100 transition-colors disabled:opacity-50"
              style={{ color: 'var(--accent-primary)' }}
              title="Generar descripción con IA"
            >
              {askLLM.isPending ? (
                <>
                  <span
                    className="size-3 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: 'var(--accent-primary-ring)',
                      borderTopColor: 'var(--accent-primary)',
                    }}
                  />
                  Pensando…
                </>
              ) : (
                <>
                  <SparkleIcon size={11} />
                  IA
                </>
              )}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditing(false)
                  setDescDraft(entity.description ?? '')
                  setUrlDraft(entity.spotifyUrl ?? '')
                }}
                className="btn-ghost text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={updateEntity.isPending}
                className="btn-ink text-xs"
              >
                {updateEntity.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="group">
      {entity.description ? (
        <p className="text-ink-700 leading-relaxed">{entity.description}</p>
      ) : (
        <p className="text-ink-300 italic text-sm">sin descripción.</p>
      )}
      <button
        onClick={() => setEditing(true)}
        className="mt-2 text-xs uppercase tracking-wider text-ink-400 hover:text-ink-700 transition-colors"
      >
        editar
      </button>
    </section>
  )
}
