import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAsk, useUpdateEntity } from '../../state'
import type { Entity } from '../../types'
import { SparkleIcon } from '../Icons'
import { Spinner } from '../Spinner'
import { InlineLoadingLabel } from '../InlineLoadingLabel'

// Tipos donde un link de Spotify tiene sentido (banda, músico, álbum, etc.).
// Si la entidad no es de estos tipos, el input de URL se oculta.
const SPOTIFY_TYPES = new Set(['banda', 'musico', 'cancion', 'album', 'disco', 'artista'])

/**
 * Editor del bloque "descripción + Spotify URL" del panel de detalle.
 *
 * Es un formulario controlado: el display de la descripción vive en el
 * header (debajo del título) y la edición se dispara desde el menú ⋯ (o
 * con doble-clic sobre el texto). Por eso este componente solo se monta
 * mientras se edita y avisa con `onDone` cuando termina (guardar/cancelar).
 *
 * El botón "IA" usa /api/ask para proponer una frase corta (≤15 palabras)
 * que llena el textarea — el usuario revisa y guarda.
 */
export function DescriptionEditor({
  entity,
  onDone,
}: {
  entity: Entity
  onDone: () => void
}) {
  const updateEntity = useUpdateEntity()
  const askLLM = useAsk()

  const [descDraft, setDescDraft] = useState(entity.description ?? '')
  const [urlDraft, setUrlDraft] = useState(entity.spotifyUrl ?? '')
  const [wikiDraft, setWikiDraft] = useState(entity.wikipediaUrl ?? '')
  const [wikiSearching, setWikiSearching] = useState(false)
  const [wikiMatch, setWikiMatch] = useState<string | null>(null)
  const [grokDraft, setGrokDraft] = useState(entity.grokipediaUrl ?? '')

  // Sincronizar drafts cuando cambia la entidad (p.ej. el usuario abre otro
  // panel sin desmontar este — pasa cuando se navega entre entidades vía
  // las conexiones).
  useEffect(() => {
    setDescDraft(entity.description ?? '')
    setUrlDraft(entity.spotifyUrl ?? '')
    setWikiDraft(entity.wikipediaUrl ?? '')
    setWikiMatch(null)
    setGrokDraft(entity.grokipediaUrl ?? '')
  }, [
    entity.id,
    entity.description,
    entity.spotifyUrl,
    entity.wikipediaUrl,
    entity.grokipediaUrl,
  ])

  const allowsSpotify = SPOTIFY_TYPES.has(entity.type)

  // Busca en Wikipedia el artículo del nombre de la entidad y llena el campo
  // con el mejor match (el usuario lo revisa/edita antes de guardar).
  async function handleSearchWikipedia() {
    if (wikiSearching) return
    setWikiSearching(true)
    setWikiMatch(null)
    try {
      const { results } = await api.searchWikipedia(entity.name)
      const top = results[0]
      if (top) {
        setWikiDraft(top.url)
        setWikiMatch(top.title)
      } else {
        setWikiMatch('(sin resultados)')
      }
    } catch {
      setWikiMatch('(no se pudo buscar)')
    } finally {
      setWikiSearching(false)
    }
  }

  async function handleSuggestDescription() {
    if (askLLM.isPending) return
    const meta = [entity.type, entity.year !== undefined ? `año ${entity.year}` : '']
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
    const wiki = wikiDraft.trim()
    const patch: Parameters<typeof updateEntity.mutate>[0]['patch'] = {}
    if ((entity.description ?? '') !== desc) {
      patch.description = desc ? desc : null
    }
    if ((entity.spotifyUrl ?? '') !== url) {
      patch.spotifyUrl = url ? url : null
    }
    if ((entity.wikipediaUrl ?? '') !== wiki) {
      patch.wikipediaUrl = wiki ? wiki : null
    }
    const grok = grokDraft.trim()
    if ((entity.grokipediaUrl ?? '') !== grok) {
      patch.grokipediaUrl = grok ? grok : null
    }
    if (Object.keys(patch).length === 0) {
      onDone()
      return
    }
    try {
      await updateEntity.mutateAsync({ id: entity.id, patch })
      onDone()
    } catch {
      // error surfaces via updateEntity.error
    }
  }

  return (
    <section className="space-y-2">
      <textarea
        value={descDraft}
        onChange={(e) => setDescDraft(e.target.value)}
        placeholder="descripción"
        rows={3}
        className="input-paper w-full resize-none"
        autoFocus
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
      {/* Wikipedia — para cualquier tipo. El botón propone el artículo; el
          usuario lo revisa antes de guardar (el match por nombre es ambiguo). */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={wikiDraft}
            onChange={(e) => setWikiDraft(e.target.value)}
            placeholder="https://es.wikipedia.org/wiki/…"
            className="input-paper w-full text-sm"
          />
          <button
            type="button"
            onClick={handleSearchWikipedia}
            disabled={wikiSearching}
            className="btn-ghost shrink-0 whitespace-nowrap text-xs disabled:opacity-50"
            title="Buscar el artículo de Wikipedia para esta entidad"
          >
            {wikiSearching ? (
              <InlineLoadingLabel text="buscando" />
            ) : (
              'buscar en Wikipedia'
            )}
          </button>
        </div>
        {wikiMatch && <p className="text-micro text-ink-400">→ {wikiMatch}</p>}
      </div>
      {/* Grokipedia — para cualquier tipo. Grokipedia no tiene API pública de
          búsqueda, así que el llenado es manual: el botón abre el sitio y el
          usuario pega la URL del artículo. */}
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={grokDraft}
          onChange={(e) => setGrokDraft(e.target.value)}
          placeholder="https://grokipedia.com/…"
          className="input-paper w-full text-sm"
        />
        <button
          type="button"
          onClick={() =>
            window.open(
              `https://grokipedia.com/search?q=${encodeURIComponent(entity.name)}`,
              '_blank',
              'noopener,noreferrer',
            )
          }
          className="btn-ghost shrink-0 whitespace-nowrap text-xs"
          title="Abrir Grokipedia para buscar y copiar la URL del artículo"
        >
          abrir Grokipedia
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleSuggestDescription}
          disabled={askLLM.isPending}
          className="inline-flex items-center justify-center size-7 rounded-md border border-ink-100 hover:bg-ink-100 transition-colors disabled:opacity-50"
          style={{ color: 'var(--accent-primary)' }}
          aria-label="Generar descripción con IA"
          title="Generar descripción con IA"
        >
          {askLLM.isPending ? (
            <Spinner size={14} variant="ai" decorative />
          ) : (
            <SparkleIcon size={14} />
          )}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onDone} className="btn-ghost text-xs">
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
    </section>
  )
}
