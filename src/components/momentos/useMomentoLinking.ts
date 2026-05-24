import { useState } from 'react'
import { api } from '../../api'
import type { Momento, MomentoPayload } from '../../types'
import { useUpdateMomento, useToast } from '../../state'

/**
 * Hook que orquesta el panel "vincular entidades" que aparece después
 * de crear un recorte o foto. Tres responsabilidades:
 *
 *   1. Mantener el momento "abierto para linking" (linkingMomento)
 *   2. Pedirle a la IA sus matched IDs (recortes via suggest-entities,
 *      fotos via vision-suggest) y opcional caption
 *   3. Aplicar el set de IDs confirmado al backend
 *
 * Quien llama (MomentosView) decide cuándo abrir el panel via openFor()
 * — típicamente desde el callback onCreated del composer.
 */
export function useMomentoLinking() {
  const updateMomento = useUpdateMomento()
  const toast = useToast()

  const [linkingMomento, setLinkingMomento] = useState<Momento | null>(null)
  const [suggestedIds, setSuggestedIds] = useState<string[]>([])
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)
  const [visionCaption, setVisionCaption] = useState<string | null>(null)

  /** Abre el panel para un momento recién creado y autodispara la
   *  sugerencia IA si el momento tiene texto/imagen suficiente. */
  async function openFor(momento: Momento) {
    setLinkingMomento(momento)
    setSuggestedIds([])
    setConfirmedIds(new Set())
    setVisionCaption(null)

    if (momento.kind === 'foto') {
      await runVisionSuggest(momento.id)
      return
    }
    if (momento.kind === 'recorte') {
      const hasText =
        (momento.payload.title?.length ?? 0) > 0 ||
        (momento.payload.bodyText?.length ?? 0) > 30 ||
        (momento.note?.length ?? 0) > 0
      if (hasText) await runTextSuggest(momento.id)
    }
  }

  async function runTextSuggest(momentoId: string) {
    setSuggesting(true)
    try {
      const res = await api.momentoSuggestEntities(momentoId)
      setSuggestedIds(res.matchedIds)
      setConfirmedIds(new Set(res.matchedIds))
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo sugerir',
        tone: 'error',
      })
    } finally {
      setSuggesting(false)
    }
  }

  async function runVisionSuggest(momentoId: string) {
    setSuggesting(true)
    try {
      const res = await api.momentoVisionSuggest(momentoId)
      if (res.caption) setVisionCaption(res.caption)
      setSuggestedIds(res.matchedIds)
      setConfirmedIds(new Set(res.matchedIds))
    } catch (err) {
      toast.show({
        message:
          err instanceof Error ? err.message : 'No se pudo analizar la imagen',
        tone: 'error',
      })
    } finally {
      setSuggesting(false)
    }
  }

  function rerun() {
    if (!linkingMomento) return
    if (linkingMomento.kind === 'foto') runVisionSuggest(linkingMomento.id)
    else runTextSuggest(linkingMomento.id)
  }

  function toggleId(id: string) {
    setConfirmedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function close() {
    setLinkingMomento(null)
    setSuggestedIds([])
    setConfirmedIds(new Set())
    setVisionCaption(null)
  }

  /** Aplica los IDs confirmados (y opcionalmente el caption sugerido)
   *  al momento en backend. Cierra el panel al terminar. */
  async function apply(opts?: { acceptCaption?: boolean }) {
    if (!linkingMomento) return
    const ids = Array.from(confirmedIds)
    const patch: {
      entityIds: string[]
      payload?: MomentoPayload
    } = { entityIds: ids }

    if (
      opts?.acceptCaption &&
      visionCaption &&
      linkingMomento.kind === 'foto'
    ) {
      patch.payload = { ...linkingMomento.payload, caption: visionCaption }
    }

    try {
      await updateMomento.mutateAsync({ id: linkingMomento.id, patch })
      toast.show({
        message:
          ids.length === 0
            ? 'Sin vínculos. Momento guardado.'
            : `${ids.length} vínculo${ids.length === 1 ? '' : 's'} guardado${ids.length === 1 ? '' : 's'}.`,
        tone: 'success',
      })
      close()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo vincular',
        tone: 'error',
      })
    }
  }

  return {
    linkingMomento,
    suggestedIds,
    confirmedIds,
    suggesting,
    visionCaption,
    isApplying: updateMomento.isPending,
    openFor,
    rerun,
    toggleId,
    close,
    apply,
  }
}
