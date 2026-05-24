import { useMemo, useState, type FormEvent } from 'react'
import {
  useInfiniteMomentosQuery,
  useAddMomento,
  useUpdateMomento,
  useDeleteMomento,
  useEntitiesQuery,
  useToast,
} from '../state'
import { api } from '../api'
import { typeAccent } from './graph/GraphNode'
import type { Entity, Momento, MomentoKind, MomentoPayload } from '../types'
import { EndMark, SparkleIcon, TrashIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { OrnamentBreak } from './Icons'

/**
 * Momentos — la dimensión temporal de la trama.
 *
 * Esta es la fase ξ1: solo `nota` por ahora (texto puro). En ξ2 entran
 * los recortes (URL + autor + fuente) y en ξ3 las fotos. La UI ya está
 * pensada para crecer: el composer tiene un toggle de kind, pero hoy
 * sólo deja crear notas.
 *
 * Vista: timeline cronológico agrupado por día. Cada día con su header
 * tipográfico (fecha en small caps serif), y abajo las entradas del día
 * en orden capturado descendente.
 *
 * El composer es minimal: textarea + botón Guardar. Cuando se guarda,
 * la nota aparece inmediatamente arriba del día actual via TanStack
 * invalidation (optimistic update sería mejor pero invalidate alcanza).
 */

function formatDateHeading(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  return d.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function groupByDay(items: Momento[]): Array<{ dayKey: string; entries: Momento[] }> {
  const groups = new Map<string, Momento[]>()
  for (const m of items) {
    const d = new Date(m.capturedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  // Mantener orden de aparición (los items ya vienen ordenados desc por
  // captured_at) — Map preserva insertion order.
  return Array.from(groups.entries()).map(([dayKey, entries]) => ({
    dayKey,
    entries,
  }))
}

export function MomentosView() {
  // ξ4: filtro por kind. null = todos. Modifica la queryKey de la
  // infinite query, así que el cache no se mezcla entre filtros.
  const [filterKind, setFilterKind] = useState<MomentoKind | null>(null)
  // ξ4: toggle entre vista cronológica (default) y vista álbum (grid).
  // Solo tiene sentido en álbum cuando filterKind === 'foto'.
  const [viewMode, setViewMode] = useState<'timeline' | 'album'>('timeline')

  const momentosQuery = useInfiniteMomentosQuery(
    filterKind ? { kind: filterKind } : undefined,
  )
  const addMomento = useAddMomento()
  const updateMomento = useUpdateMomento()
  const deleteMomento = useDeleteMomento()
  const { data: entities = [] } = useEntitiesQuery()
  const toast = useToast()

  const items = useMemo(
    () => momentosQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [momentosQuery.data],
  )
  const groups = useMemo(() => groupByDay(items), [items])
  const entitiesById = useMemo(() => {
    const map = new Map<string, Entity>()
    for (const e of entities) map.set(e.id, e)
    return map
  }, [entities])

  // ξ2/ξ3: tab del composer. nota / recorte / foto.
  const [composerKind, setComposerKind] = useState<MomentoKind>('nota')

  // Estados del composer — uno por tipo de campo. Vacíos al iniciar y
  // se limpian post-guardar.
  const [noteDraft, setNoteDraft] = useState('')
  const [recorteUrl, setRecorteUrl] = useState('')
  const [recorteTitle, setRecorteTitle] = useState('')
  const [recorteBody, setRecorteBody] = useState('')
  const [recorteSource, setRecorteSource] = useState('')
  const [recorteAuthor, setRecorteAuthor] = useState('')
  const [recorteNote, setRecorteNote] = useState('')
  const [previewing, setPreviewing] = useState(false)

  // ξ3: estados de foto.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoCaption, setPhotoCaption] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)

  function handlePhotoFileChange(file: File | null) {
    // Revocar URL anterior para evitar leaks.
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(file)
    if (file) {
      setPhotoPreviewUrl(URL.createObjectURL(file))
    } else {
      setPhotoPreviewUrl(null)
    }
  }

  // ξ2: pidiendo a la IA que sugiera entidades para el último recorte
  // creado. Se gatilla automáticamente al guardar y se muestra un panel
  // inline para confirmar vínculos.
  const [linkingMomento, setLinkingMomento] = useState<Momento | null>(null)
  const [suggestedIds, setSuggestedIds] = useState<string[]>([])
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)
  /** ξ3: caption sugerido por vision AI para una foto recién subida. */
  const [visionCaption, setVisionCaption] = useState<string | null>(null)

  async function fetchPreview() {
    const url = recorteUrl.trim()
    if (!url || previewing) return
    setPreviewing(true)
    try {
      const preview = await api.momentoUrlPreview(url)
      // Solo rellenamos campos vacíos para no pisar lo que el usuario tipeó.
      if (preview.title && !recorteTitle.trim()) setRecorteTitle(preview.title)
      if (preview.description && !recorteBody.trim()) setRecorteBody(preview.description)
      if (preview.source && !recorteSource.trim()) setRecorteSource(preview.source)
      if (preview.author && !recorteAuthor.trim()) setRecorteAuthor(preview.author)
      if (!preview.fetched) {
        toast.show({
          message: 'No se pudo extraer info de la URL. Completa los campos a mano.',
          tone: 'default',
        })
      }
    } catch {
      // Silencioso — el usuario sigue pudiendo llenar manual.
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (addMomento.isPending) return

    let payload: MomentoPayload
    if (composerKind === 'nota') {
      const text = noteDraft.trim()
      if (!text) return
      payload = { bodyText: text }
      try {
        await addMomento.mutateAsync({ kind: 'nota', payload })
        setNoteDraft('')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo guardar'
        toast.show({ message: msg, tone: 'error' })
      }
      return
    }

    if (composerKind === 'recorte') {
      const hasAnything =
        recorteUrl.trim() ||
        recorteTitle.trim() ||
        recorteBody.trim() ||
        recorteNote.trim()
      if (!hasAnything) return
      payload = {
        url: recorteUrl.trim() || undefined,
        title: recorteTitle.trim() || undefined,
        bodyText: recorteBody.trim() || undefined,
        source: recorteSource.trim() || undefined,
        author: recorteAuthor.trim() || undefined,
      }
      try {
        const created = await addMomento.mutateAsync({
          kind: 'recorte',
          payload,
          note: recorteNote.trim() || undefined,
        })
        setRecorteUrl('')
        setRecorteTitle('')
        setRecorteBody('')
        setRecorteSource('')
        setRecorteAuthor('')
        setRecorteNote('')
        setLinkingMomento(created)
        setConfirmedIds(new Set())
        setSuggestedIds([])
        const hasText =
          (payload.title?.length ?? 0) > 0 ||
          (payload.bodyText?.length ?? 0) > 30 ||
          (created.note?.length ?? 0) > 0
        if (hasText) {
          triggerSuggest(created.id)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo guardar'
        toast.show({ message: msg, tone: 'error' })
      }
      return
    }

    // composerKind === 'foto'
    if (!photoFile) {
      toast.show({ message: 'Elige una imagen', tone: 'default' })
      return
    }
    setPhotoUploading(true)
    try {
      // 1) Upload del archivo a Netlify Blobs.
      const uploaded = await api.momentoUpload(photoFile)
      // 2) Leer dimensiones del lado del cliente para poder mostrar
      //    aspect ratio sin re-cargar la imagen.
      const { width, height } = await readImageDimensions(photoFile)
      // 3) Crear momento foto.
      payload = {
        storageKey: uploaded.storageKey,
        width,
        height,
        caption: photoCaption.trim() || undefined,
      }
      const created = await addMomento.mutateAsync({
        kind: 'foto',
        payload,
        note: photoNote.trim() || undefined,
      })
      // Limpiar form.
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      setPhotoFile(null)
      setPhotoPreviewUrl(null)
      setPhotoCaption('')
      setPhotoNote('')
      // Vision suggest auto-trigger.
      setLinkingMomento(created)
      setConfirmedIds(new Set())
      setSuggestedIds([])
      triggerVisionSuggest(created.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setPhotoUploading(false)
    }
  }

  /** Lee width/height de un File de imagen creando un Image temporal. */
  function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({ width: 0, height: 0 })
      }
      img.src = url
    })
  }

  async function triggerVisionSuggest(momentoId: string) {
    setSuggesting(true)
    try {
      const res = await api.momentoVisionSuggest(momentoId)
      // Si la IA propuso un caption y no tenemos uno, lo aplicamos.
      if (res.caption && linkingMomento) {
        // Sin acceso fácil al payload actual aquí; el caption queda como
        // sugerencia para el usuario en el panel de linking.
        // Lo mostramos abajo en el panel — guardamos en state separado.
        setVisionCaption(res.caption)
      }
      setSuggestedIds(res.matchedIds)
      setConfirmedIds(new Set(res.matchedIds))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo analizar la imagen'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setSuggesting(false)
    }
  }

  async function triggerSuggest(momentoId: string) {
    setSuggesting(true)
    try {
      const res = await api.momentoSuggestEntities(momentoId)
      setSuggestedIds(res.matchedIds)
      setConfirmedIds(new Set(res.matchedIds)) // pre-check todos los matches
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo sugerir'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setSuggesting(false)
    }
  }

  async function applyLinks(opts?: { acceptCaption?: boolean }) {
    if (!linkingMomento) return
    const ids = Array.from(confirmedIds)
    const patch: {
      entityIds: string[]
      payload?: MomentoPayload
    } = { entityIds: ids }

    // ξ3: si la IA propuso un caption para una foto y el usuario lo
    // aceptó, lo incluimos en el patch del payload.
    if (
      opts?.acceptCaption &&
      visionCaption &&
      linkingMomento.kind === 'foto'
    ) {
      patch.payload = {
        ...linkingMomento.payload,
        caption: visionCaption,
      }
    }

    try {
      await updateMomento.mutateAsync({
        id: linkingMomento.id,
        patch,
      })
      toast.show({
        message:
          ids.length === 0
            ? 'Sin vínculos. Momento guardado.'
            : `${ids.length} vínculo${ids.length === 1 ? '' : 's'} guardado${ids.length === 1 ? '' : 's'}.`,
        tone: 'success',
      })
      setLinkingMomento(null)
      setSuggestedIds([])
      setConfirmedIds(new Set())
      setVisionCaption(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo vincular'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMomento.mutateAsync(id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  return (
    <>
      <header className="mb-10">
        <p
          className="section-eyebrow-serif mb-2"
          style={{ color: 'var(--accent-gold)' }}
        >
          ✦ memoria fechada
        </p>
        <h2 className="font-serif text-4xl text-ink-700 leading-none">Momentos</h2>
        <div className="accent-rule mt-3 mb-2" />
        <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-xl">
          Lo que viste, leíste o pensaste un día concreto. La trama gana
          tiempo. Por ahora notas; pronto recortes del mundo y fotos.
        </p>
      </header>

      {/* Composer con tabs por kind. Las fotos vienen en ξ3 — todavía no
          tienen tab visible. */}
      <form
        onSubmit={handleSubmit}
        className="mb-10 p-5 bg-paper-100/40 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
      >
        <header className="stack-2 pb-3 border-b border-ink-100/60">
          <p
            className="section-eyebrow-serif"
            style={{ color: 'var(--accent-gold)' }}
          >
            nueva entrada
          </p>
          <h3 className="font-serif text-xl text-ink-800 leading-tight">
            {composerKind === 'nota'
              ? '¿Qué viste, leíste o pensaste hoy?'
              : 'Algo del mundo que te llamó la atención'}
          </h3>
        </header>

        {/* Tabs kind */}
        <div className="flex gap-1 p-1 bg-paper-50/60 rounded-lg border border-ink-100/50 w-fit">
          {(['nota', 'recorte', 'foto'] as MomentoKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setComposerKind(k)}
              className={`px-3 py-1 rounded text-caption transition-all duration-150 active:scale-95 ${
                composerKind === k
                  ? 'bg-paper-50 text-ink-700 shadow-sm'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {k === 'nota' ? 'Nota' : k === 'recorte' ? 'Recorte' : 'Foto'}
            </button>
          ))}
        </div>

        {composerKind === 'nota' && (
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Una observación, una idea, un recuerdo del día…"
            rows={3}
            className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
            disabled={addMomento.isPending}
          />
        )}

        {composerKind === 'recorte' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                value={recorteUrl}
                onChange={(e) => setRecorteUrl(e.target.value)}
                onBlur={fetchPreview}
                placeholder="https://… (opcional, pega y la IA lo lee)"
                className="input-paper flex-1"
                disabled={addMomento.isPending}
              />
              <button
                type="button"
                onClick={fetchPreview}
                disabled={!recorteUrl.trim() || previewing}
                className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 disabled:opacity-50 px-2"
                title="Buscar título y descripción de la URL"
              >
                {previewing ? 'leyendo…' : '↻ leer'}
              </button>
            </div>
            <input
              type="text"
              value={recorteTitle}
              onChange={(e) => setRecorteTitle(e.target.value)}
              placeholder="Título"
              className="input-paper w-full"
              disabled={addMomento.isPending}
            />
            <textarea
              value={recorteBody}
              onChange={(e) => setRecorteBody(e.target.value)}
              placeholder="Texto del recorte (el tweet, el párrafo, lo que pegues)"
              rows={3}
              className="input-paper w-full resize-none font-serif text-sm leading-relaxed placeholder:italic"
              disabled={addMomento.isPending}
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={recorteAuthor}
                onChange={(e) => setRecorteAuthor(e.target.value)}
                placeholder="Autor (opcional)"
                className="input-paper flex-1"
                disabled={addMomento.isPending}
              />
              <input
                type="text"
                value={recorteSource}
                onChange={(e) => setRecorteSource(e.target.value)}
                placeholder="Fuente (Twitter, blog…)"
                className="input-paper flex-1"
                disabled={addMomento.isPending}
              />
            </div>
            <textarea
              value={recorteNote}
              onChange={(e) => setRecorteNote(e.target.value)}
              placeholder="Tu nota: por qué te llamó la atención"
              rows={2}
              className="input-paper w-full resize-none marginalia-script placeholder:italic placeholder:font-sans"
              disabled={addMomento.isPending}
            />
          </div>
        )}

        {composerKind === 'foto' && (
          <div className="space-y-3">
            {/* File picker — clickable label + drag overlay opcional. */}
            <label
              className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                photoFile
                  ? 'border-transparent'
                  : 'border-ink-200/60 hover:border-ink-300 hover:bg-paper-50/50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f && f.type.startsWith('image/')) {
                  handlePhotoFileChange(f)
                }
              }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  handlePhotoFileChange(f)
                }}
                disabled={photoUploading || addMomento.isPending}
              />
              {photoPreviewUrl ? (
                <div className="space-y-2">
                  <img
                    src={photoPreviewUrl}
                    alt="preview"
                    className="max-h-64 mx-auto rounded shadow-sm"
                  />
                  <p className="text-caption text-ink-400 italic">
                    Click para cambiar la imagen
                  </p>
                </div>
              ) : (
                <div className="text-ink-400">
                  <p className="text-sm">Arrastra una imagen aquí o click para elegir</p>
                  <p className="text-caption italic mt-1">
                    JPEG / PNG / WebP / GIF · hasta 10 MB
                  </p>
                </div>
              )}
            </label>
            <input
              type="text"
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Caption (opcional — la IA propondrá uno)"
              className="input-paper w-full"
              disabled={photoUploading || addMomento.isPending}
            />
            <textarea
              value={photoNote}
              onChange={(e) => setPhotoNote(e.target.value)}
              placeholder="Tu nota sobre la foto (opcional)"
              rows={2}
              className="input-paper w-full resize-none marginalia-script placeholder:italic placeholder:font-sans"
              disabled={photoUploading || addMomento.isPending}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-caption text-ink-300 italic">
            {composerKind === 'recorte'
              ? 'Al guardar, la IA propone vínculos a tus entidades.'
              : composerKind === 'foto'
                ? 'La IA lee la imagen y propone caption + vínculos.'
                : 'Se guarda fechado hoy.'}
          </p>
          <button
            type="submit"
            disabled={addMomento.isPending || photoUploading}
            className="btn-ink"
          >
            {photoUploading
              ? 'Subiendo…'
              : addMomento.isPending
                ? 'Guardando…'
                : 'Guardar'}
          </button>
        </div>
      </form>

      {/* ξ2: panel de vinculación post-guardar de un recorte. */}
      {linkingMomento && (
        <section
          className="mb-10 p-5 bg-paper-100/60 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at center, var(--accent-gold-soft) 0%, transparent 70%)',
          }}
        >
          <header className="flex items-baseline justify-between gap-3">
            <div>
              <p
                className="section-eyebrow-serif"
                style={{ color: 'var(--accent-gold)' }}
              >
                ✦ vincular entidades
              </p>
              <p className="text-caption text-ink-400 italic mt-0.5">
                ¿A qué entidades de tu trama refiere este recorte?
              </p>
            </div>
            <button
              type="button"
              onClick={() => triggerSuggest(linkingMomento.id)}
              disabled={suggesting}
              className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 disabled:opacity-50"
            >
              {suggesting ? 'pensando…' : '↻ re-buscar'}
            </button>
          </header>

          {/* ξ3: caption sugerido por vision AI para fotos. */}
          {linkingMomento?.kind === 'foto' && visionCaption && (
            <div className="p-3 rounded bg-paper-50/60 border border-ink-100/60">
              <p className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                caption propuesto
              </p>
              <p className="font-serif text-sm text-ink-600 italic">
                {visionCaption}
              </p>
            </div>
          )}

          {suggesting && suggestedIds.length === 0 && (
            <p className="text-caption text-ink-400 italic">
              {linkingMomento?.kind === 'foto'
                ? 'La IA está mirando la imagen…'
                : `La IA está revisando tus ${entities.length} entidades…`}
            </p>
          )}

          {!suggesting && suggestedIds.length === 0 && (
            <p className="text-caption text-ink-400 italic">
              La IA no encontró menciones explícitas. Puedes guardar sin vínculos o re-buscar.
            </p>
          )}

          {suggestedIds.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {suggestedIds.map((id) => {
                const ent = entitiesById.get(id)
                if (!ent) return null
                const checked = confirmedIds.has(id)
                const accent = typeAccent(ent.type)
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmedIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(id)) next.delete(id)
                          else next.add(id)
                          return next
                        })
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption transition-all active:scale-95"
                      style={
                        checked
                          ? {
                              backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                              color: accent,
                              border: `1px solid ${accent}`,
                            }
                          : {
                              backgroundColor: 'transparent',
                              color: 'rgb(var(--ink-400))',
                              border: '1px solid rgb(var(--ink-100))',
                            }
                      }
                    >
                      <span>{checked ? '✓' : '+'}</span>
                      {ent.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-100/40">
            <button
              type="button"
              onClick={() => {
                setLinkingMomento(null)
                setSuggestedIds([])
                setConfirmedIds(new Set())
              }}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700"
            >
              omitir
            </button>
            <button
              type="button"
              onClick={() =>
                applyLinks({
                  acceptCaption:
                    linkingMomento?.kind === 'foto' && Boolean(visionCaption),
                })
              }
              disabled={updateMomento.isPending}
              className="btn-ink text-xs"
            >
              {updateMomento.isPending
                ? 'guardando…'
                : confirmedIds.size === 0
                  ? linkingMomento?.kind === 'foto' && visionCaption
                    ? 'Guardar caption'
                    : 'Guardar sin vínculos'
                  : `Guardar ${confirmedIds.size} vínculo${confirmedIds.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>
      )}

      {/* ξ4: filtros por kind + toggle de view (timeline | álbum). */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <FilterChip
            label="Todos"
            active={filterKind === null}
            onClick={() => setFilterKind(null)}
          />
          <FilterChip
            label="Notas"
            active={filterKind === 'nota'}
            onClick={() => {
              setFilterKind('nota')
              setViewMode('timeline')
            }}
          />
          <FilterChip
            label="Recortes"
            active={filterKind === 'recorte'}
            onClick={() => {
              setFilterKind('recorte')
              setViewMode('timeline')
            }}
          />
          <FilterChip
            label="Fotos"
            active={filterKind === 'foto'}
            onClick={() => setFilterKind('foto')}
          />
        </div>
        {/* Toggle timeline ↔ álbum, solo relevante con filterKind='foto'. */}
        {filterKind === 'foto' && (
          <div className="ml-auto flex gap-1 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1 rounded text-caption transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-paper-50 text-ink-700 shadow-sm'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              Línea
            </button>
            <button
              onClick={() => setViewMode('album')}
              className={`px-2.5 py-1 rounded text-caption transition-colors ${
                viewMode === 'album'
                  ? 'bg-paper-50 text-ink-700 shadow-sm'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              Álbum
            </button>
          </div>
        )}
      </div>

      {momentosQuery.isLoading ? (
        <p className="text-ink-300 italic text-sm">Cargando momentos…</p>
      ) : items.length === 0 ? (
        <EmptyMessage
          title="Todavía no hay momentos"
          body={
            <>
              Las entradas que crees acá quedan en una línea de tiempo. Más
              adelante podrás pegar tweets, links, screenshots y fotos —
              hoy, solo notas tuyas para empezar.
            </>
          }
        />
      ) : viewMode === 'album' && filterKind === 'foto' ? (
        // ξ4: vista álbum — grid masonry-like de thumbnails, grouped por mes.
        <AlbumGrid
          items={items}
          entitiesById={entitiesById}
          onDelete={handleDelete}
        />
      ) : (
        <div className="space-y-10">
          {groups.map(({ dayKey, entries }) => (
            <section key={dayKey} className="animate-fade-up">
              <div className="mb-3 flex items-baseline gap-3">
                <h3
                  className="section-eyebrow-serif"
                  style={{ color: 'var(--accent-gold)' }}
                >
                  {formatDateHeading(entries[0].capturedAt)}
                </h3>
                <span className="flex-1 h-px bg-ink-100/40" />
                <span className="text-caption text-ink-300 tabular-nums">
                  {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
                </span>
              </div>
              <ul className="space-y-4">
                {entries.map((m) => (
                  <MomentoEntry
                    key={m.id}
                    momento={m}
                    entitiesById={entitiesById}
                    onDelete={() => handleDelete(m.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {momentosQuery.hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => momentosQuery.fetchNextPage()}
                disabled={momentosQuery.isFetchingNextPage}
                className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
              >
                {momentosQuery.isFetchingNextPage ? 'cargando…' : 'más atrás ↓'}
              </button>
            </div>
          )}

          {!momentosQuery.hasNextPage && items.length >= 5 && (
            <div className="flex flex-col items-center gap-2 pt-8 text-ink-300">
              <OrnamentBreak />
              <EndMark size={14} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function MomentoEntry({
  momento,
  entitiesById,
  onDelete,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  onDelete: () => void
}) {
  const linkedEntities = momento.entityIds
    .map((id) => entitiesById.get(id))
    .filter((e): e is Entity => Boolean(e))

  return (
    <li className="group relative pl-5">
      {/* Marca temporal a la izquierda — italic tipográfico, no chip. */}
      <span
        className="absolute left-0 top-1 text-caption italic text-ink-300 tabular-nums w-12 -ml-1 text-right pr-2 border-r border-ink-100/40"
        aria-hidden="true"
      >
        {formatTime(momento.capturedAt)}
      </span>
      <div className="ml-12">
        {/* Render por kind. */}
        {momento.kind === 'nota' && momento.payload.bodyText && (
          <p className="font-serif text-base text-ink-700 leading-relaxed whitespace-pre-wrap">
            {momento.payload.bodyText}
          </p>
        )}

        {momento.kind === 'recorte' && (
          <RecorteBody momento={momento} />
        )}

        {momento.kind === 'foto' && <FotoBody momento={momento} />}

        {momento.origin.kind === 'ai' && (
          <span className="ml-2 inline-flex items-center text-sky-700/70" title="origen IA">
            <SparkleIcon size={10} />
          </span>
        )}

        {/* ξ2: chips de entidades vinculadas, color por tipo. */}
        {linkedEntities.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {linkedEntities.map((e) => {
              const accent = typeAccent(e.type)
              return (
                <li
                  key={e.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-micro tracking-eyebrow"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${accent} 11%, transparent)`,
                    color: accent,
                  }}
                  title={e.type}
                >
                  {e.name}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <button
        onClick={onDelete}
        className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded"
        aria-label="Eliminar momento"
        title="Eliminar"
      >
        <TrashIcon size={12} />
      </button>
    </li>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs transition-colors"
      style={
        active
          ? {
              backgroundColor: 'var(--accent-gold-soft)',
              color: 'var(--accent-gold)',
              fontWeight: 500,
            }
          : {
              color: 'rgb(var(--ink-500))',
            }
      }
    >
      {label}
    </button>
  )
}

function AlbumGrid({
  items,
  entitiesById,
  onDelete,
}: {
  items: Momento[]
  entitiesById: Map<string, Entity>
  onDelete: (id: string) => void
}) {
  // Agrupamos por mes-año. Las fotos dentro del mes mantienen orden
  // captured_at desc.
  const groupsByMonth = useMemo(() => {
    const map = new Map<string, Momento[]>()
    for (const m of items) {
      if (m.kind !== 'foto') continue
      const d = new Date(m.capturedAt)
      if (Number.isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const arr = map.get(key) ?? []
      arr.push(m)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [items])

  if (groupsByMonth.length === 0) {
    return (
      <EmptyMessage
        title="No hay fotos todavía"
        body={<>Sube una imagen desde el composer de arriba.</>}
      />
    )
  }

  return (
    <div className="space-y-10">
      {groupsByMonth.map(([monthKey, photos]) => {
        const [year, monthNum] = monthKey.split('-')
        const monthLabel = new Date(
          Number(year),
          Number(monthNum) - 1,
          1,
        ).toLocaleDateString('es', { month: 'long', year: 'numeric' })
        return (
          <section key={monthKey} className="animate-fade-up">
            <div className="mb-3 flex items-baseline gap-3">
              <h3
                className="section-eyebrow-serif"
                style={{ color: 'var(--accent-gold)' }}
              >
                {monthLabel}
              </h3>
              <span className="flex-1 h-px bg-ink-100/40" />
              <span className="text-caption text-ink-300 tabular-nums">
                {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
              </span>
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((p) => (
                <AlbumTile
                  key={p.id}
                  momento={p}
                  entitiesById={entitiesById}
                  onDelete={() => onDelete(p.id)}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function AlbumTile({
  momento,
  entitiesById,
  onDelete,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  onDelete: () => void
}) {
  const { storageKey, caption } = momento.payload
  const linkedEntities = momento.entityIds
    .map((id) => entitiesById.get(id))
    .filter((e): e is Entity => Boolean(e))
  if (!storageKey) return null
  const d = new Date(momento.capturedAt)
  const dateLabel = !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
    : ''

  return (
    <li className="group relative">
      <div className="aspect-square overflow-hidden rounded-md border border-ink-100/60 bg-paper-100/40">
        <img
          src={`/api/momentos/file/${encodeURIComponent(storageKey)}`}
          alt={caption ?? 'momento'}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-ink-900/70 to-transparent rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
        {caption && (
          <p className="text-paper-50 text-xs font-serif italic line-clamp-2">
            {caption}
          </p>
        )}
        <p className="text-paper-200/80 text-micro tracking-wider mt-0.5">
          {dateLabel}
        </p>
      </div>
      {linkedEntities.length > 0 && (
        <p className="mt-1 text-caption text-ink-400 truncate">
          {linkedEntities.map((e) => e.name).join(' · ')}
        </p>
      )}
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-paper-50/80 backdrop-blur-sm rounded text-ink-500 hover:text-red-700"
        aria-label="Eliminar foto"
        title="Eliminar"
      >
        <TrashIcon size={12} />
      </button>
    </li>
  )
}

function FotoBody({ momento }: { momento: Momento }) {
  const { storageKey, caption, width, height } = momento.payload
  if (!storageKey) {
    return (
      <p className="text-caption italic text-ink-400">
        (imagen no encontrada)
      </p>
    )
  }
  const aspectRatio =
    width && height && width > 0 && height > 0
      ? `${width} / ${height}`
      : undefined

  return (
    <article className="space-y-2">
      <div className="rounded-md overflow-hidden border border-ink-100/60 max-w-md">
        <img
          src={`/api/momentos/file/${encodeURIComponent(storageKey)}`}
          alt={caption ?? 'momento'}
          loading="lazy"
          className="block w-full h-auto"
          style={aspectRatio ? { aspectRatio } : undefined}
        />
      </div>
      {caption && (
        <p className="font-serif text-sm italic text-ink-500 max-w-md">
          {caption}
        </p>
      )}
      {momento.note && (
        <p className="marginalia-script whitespace-pre-wrap max-w-md">
          {momento.note}
        </p>
      )}
    </article>
  )
}

function RecorteBody({ momento }: { momento: Momento }) {
  const { url, title, bodyText, source, author } = momento.payload
  return (
    <article className="space-y-1.5">
      {(source || author) && (
        <p className="section-eyebrow-serif flex items-baseline gap-2 flex-wrap">
          {author && <span style={{ color: 'var(--accent-gold)' }}>{author}</span>}
          {author && source && <span className="text-ink-200">·</span>}
          {source && <span className="text-ink-400">{source}</span>}
        </p>
      )}
      {title && (
        <h4 className="font-serif text-lg text-ink-700 leading-snug">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink-900 transition-colors border-b border-dotted border-transparent hover:border-ink-400"
            >
              {title}
              <span className="text-ink-300 text-sm ml-1">↗</span>
            </a>
          ) : (
            title
          )}
        </h4>
      )}
      {!title && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-ink-500 hover:text-ink-700 transition-colors underline decoration-dotted"
        >
          {url} ↗
        </a>
      )}
      {bodyText && (
        <p className="font-serif text-base text-ink-600 leading-relaxed whitespace-pre-wrap border-l-2 border-ink-200/60 pl-3 italic">
          {bodyText}
        </p>
      )}
      {momento.note && (
        <p className="marginalia-script whitespace-pre-wrap mt-2">
          {momento.note}
        </p>
      )}
    </article>
  )
}
