import { useState } from 'react'
import { api } from '../../api'
import type { Momento, MomentoKind, MomentoPayload } from '../../types'
import { useAddMomento, useToast } from '../../state'
import { readImageDimensions } from './helpers'

/**
 * Custom hook que encapsula TODO el state del composer de Momentos.
 *
 * El composer tiene tres branches según `kind` (nota / recorte / foto)
 * y cada uno mantiene campos independientes. Poner eso en un hook
 * separado: (a) hace MomentosView legible, (b) deja el flow de submit
 * testeable sin renderear DOM, (c) aísla el reset post-submit.
 *
 * `onCreated` se llama con el Momento recién creado, así el caller
 * decide qué hacer después (típicamente: abrir el panel de linking).
 */
export function useMomentoComposer({
  onCreated,
  initialKind,
}: {
  onCreated?: (m: Momento) => void
  /** τ-mobile-bridge: kind con el que arranca el composer. Se usa al
      hacer deep-link desde el QR del celular: `?compose=foto` setea
      el tab Foto directo, sin que el usuario tenga que tocar el
      switcher después de escanear. */
  initialKind?: MomentoKind
}) {
  const addMomento = useAddMomento()
  const toast = useToast()

  const [kind, setKind] = useState<MomentoKind>(initialKind ?? 'nota')

  // Nota
  const [noteDraft, setNoteDraft] = useState('')

  // Recorte
  const [recorteUrl, setRecorteUrl] = useState('')
  const [recorteTitle, setRecorteTitle] = useState('')
  const [recorteBody, setRecorteBody] = useState('')
  const [recorteSource, setRecorteSource] = useState('')
  const [recorteAuthor, setRecorteAuthor] = useState('')
  const [recorteNote, setRecorteNote] = useState('')
  const [previewing, setPreviewing] = useState(false)

  // Foto
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoCaption, setPhotoCaption] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)

  function changePhotoFile(file: File | null) {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(file)
    setPhotoPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  async function fetchPreview() {
    const url = recorteUrl.trim()
    if (!url || previewing) return
    setPreviewing(true)
    try {
      const preview = await api.momentoUrlPreview(url)
      if (preview.title && !recorteTitle.trim()) setRecorteTitle(preview.title)
      if (preview.description && !recorteBody.trim())
        setRecorteBody(preview.description)
      if (preview.source && !recorteSource.trim())
        setRecorteSource(preview.source)
      if (preview.author && !recorteAuthor.trim())
        setRecorteAuthor(preview.author)
      if (!preview.fetched) {
        toast.show({
          message: 'No se pudo extraer info de la URL. Completa los campos a mano.',
          tone: 'default',
        })
      }
    } catch {
      /* silent — el usuario sigue pudiendo llenar manual */
    } finally {
      setPreviewing(false)
    }
  }

  function resetNota() {
    setNoteDraft('')
  }

  function resetRecorte() {
    setRecorteUrl('')
    setRecorteTitle('')
    setRecorteBody('')
    setRecorteSource('')
    setRecorteAuthor('')
    setRecorteNote('')
  }

  function resetFoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setPhotoCaption('')
    setPhotoNote('')
  }

  async function submit() {
    if (addMomento.isPending) return

    if (kind === 'nota') {
      const text = noteDraft.trim()
      if (!text) return
      try {
        const created = await addMomento.mutateAsync({
          kind: 'nota',
          payload: { bodyText: text } satisfies MomentoPayload,
        })
        resetNota()
        onCreated?.(created)
      } catch (err) {
        toast.show({
          message: err instanceof Error ? err.message : 'No se pudo guardar',
          tone: 'error',
        })
      }
      return
    }

    if (kind === 'recorte') {
      const hasAnything =
        recorteUrl.trim() ||
        recorteTitle.trim() ||
        recorteBody.trim() ||
        recorteNote.trim()
      if (!hasAnything) return
      const payload: MomentoPayload = {
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
        resetRecorte()
        onCreated?.(created)
      } catch (err) {
        toast.show({
          message: err instanceof Error ? err.message : 'No se pudo guardar',
          tone: 'error',
        })
      }
      return
    }

    // kind === 'foto'
    if (!photoFile) {
      toast.show({ message: 'Elige una imagen', tone: 'default' })
      return
    }
    setPhotoUploading(true)
    try {
      const uploaded = await api.momentoUpload(photoFile)
      const { width, height } = await readImageDimensions(photoFile)
      const payload: MomentoPayload = {
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
      resetFoto()
      onCreated?.(created)
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo subir',
        tone: 'error',
      })
    } finally {
      setPhotoUploading(false)
    }
  }

  return {
    kind,
    setKind,

    // Nota
    noteDraft,
    setNoteDraft,

    // Recorte
    recorteUrl,
    setRecorteUrl,
    recorteTitle,
    setRecorteTitle,
    recorteBody,
    setRecorteBody,
    recorteSource,
    setRecorteSource,
    recorteAuthor,
    setRecorteAuthor,
    recorteNote,
    setRecorteNote,
    previewing,
    fetchPreview,

    // Foto
    photoFile,
    photoPreviewUrl,
    photoCaption,
    setPhotoCaption,
    photoNote,
    setPhotoNote,
    photoUploading,
    changePhotoFile,

    // Submit
    submit,
    isPending: addMomento.isPending || photoUploading,
  }
}
