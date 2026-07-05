import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Momento, MomentoKind, MomentoPayload } from '../../types'
import { useAddMomento, useToast } from '../../state'
import {
  compressImage,
  isVideoFile,
  MAX_MEDIA_BYTES,
  readImageDimensions,
  readVideoDimensions,
} from './helpers'
import { extractPhotoCapturedAtFromFile, pickOldestCapturedAt } from '../../lib/photoExif'

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

  // Foto — υ-multi: ahora un array. Cada item es {file, previewUrl}
  // para poder iterar y manejarlos individualmente (preview + delete
  // por imagen, mostrar contador, etc.). El submit los sube todos en
  // paralelo y arma payload.items[].
  type PhotoDraft = {
    file: File
    previewUrl: string
    capturedAt?: string | null
    // ω-video: true si el draft es un clip. El preview lo pinta con <video> y
    // el submit lo sube sin comprimir (a diferencia de las fotos).
    isVideo: boolean
  }
  type PhotoDateMode = 'photo' | 'now' | 'custom'
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([])
  const [photoCaption, setPhotoCaption] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  const [photoDateMode, setPhotoDateMode] = useState<PhotoDateMode>('now')
  const [customPhotoCapturedAt, setCustomPhotoCapturedAt] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  // υ-multi: progreso de upload para feedback ("3 de 5 subidas…").
  const [photoUploadProgress, setPhotoUploadProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  // Nota de voz del episodio (opcional). Un solo archivo a nivel momento,
  // igual que la nota de texto. Se sube junto con las fotos al guardar.
  const [audioDraft, setAudioDraft] = useState<{
    file: File
    previewUrl: string
  } | null>(null)
  const photoDraftsRef = useRef(photoDrafts)
  const audioDraftRef = useRef(audioDraft)
  const photoMetadataTasksRef = useRef<Promise<void>[]>([])
  const photoDateModeRef = useRef(photoDateMode)
  const customPhotoCapturedAtRef = useRef(customPhotoCapturedAt)

  photoDraftsRef.current = photoDrafts
  audioDraftRef.current = audioDraft
  photoDateModeRef.current = photoDateMode
  customPhotoCapturedAtRef.current = customPhotoCapturedAt

  useEffect(
    () => () => {
      for (const d of photoDraftsRef.current) URL.revokeObjectURL(d.previewUrl)
      const audio = audioDraftRef.current
      if (audio) URL.revokeObjectURL(audio.previewUrl)
    },
    [],
  )

  function setAudioFile(file: File) {
    setAudioDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
  }

  function updatePhotoDateMode(mode: PhotoDateMode) {
    photoDateModeRef.current = mode
    setPhotoDateMode(mode)
  }

  function updateCustomPhotoCapturedAt(value: string) {
    customPhotoCapturedAtRef.current = value
    setCustomPhotoCapturedAt(value)
  }

  function clearAudio() {
    setAudioDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }

  function addPhotoFiles(files: File[]) {
    // ω-video: aceptamos imágenes y videos. Los clips no se comprimen
    // client-side, así que su tamaño se valida acá contra el mismo tope del
    // backend — mejor un aviso claro al elegir que un rechazo del server al
    // subir. Las imágenes grandes sí pasan (la compresión las baja luego).
    const accepted: File[] = []
    let rejectedForSize = 0
    for (const file of files) {
      const video = isVideoFile(file)
      if (!video && !file.type.startsWith('image/')) continue
      if (video && file.size > MAX_MEDIA_BYTES) {
        rejectedForSize += 1
        continue
      }
      accepted.push(file)
    }
    if (rejectedForSize > 0) {
      toast.show({
        message:
          rejectedForSize === 1
            ? 'El video supera los 10 MB. Usa un clip más corto.'
            : `${rejectedForSize} videos superan los 10 MB y no se agregaron.`,
        tone: 'error',
      })
    }
    if (accepted.length === 0) return
    const drafts: PhotoDraft[] = accepted.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      capturedAt: null,
      isVideo: isVideoFile(file),
    }))
    photoDraftsRef.current = [...photoDraftsRef.current, ...drafts]
    setPhotoDrafts(photoDraftsRef.current)
    for (const draft of drafts) {
      // El EXIF de fecha solo aplica a fotos; los videos no pasan por acá.
      if (!draft.isVideo) trackPhotoMetadata(draft)
    }
  }

  function trackPhotoMetadata(draft: PhotoDraft) {
    const task = extractPhotoCapturedAtFromFile(draft.file)
      .then((capturedAt) => {
        photoDraftsRef.current = photoDraftsRef.current.map((item) =>
          item.previewUrl === draft.previewUrl ? { ...item, capturedAt } : item,
        )
        setPhotoDrafts(photoDraftsRef.current)
        if (capturedAt && photoDateModeRef.current === 'now') updatePhotoDateMode('photo')
      })
      .finally(() => {
        photoMetadataTasksRef.current = photoMetadataTasksRef.current.filter(
          (item) => item !== task,
        )
      })
    photoMetadataTasksRef.current.push(task)
  }

  function removePhotoDraft(index: number) {
    setPhotoDrafts((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      photoDraftsRef.current = next
      return next
    })
  }

  /** Reemplaza el archivo de un draft (resultado del editor de imágenes),
   *  revocando el preview viejo y creando uno nuevo. */
  function replacePhotoDraft(index: number, file: File) {
    setPhotoDrafts((prev) => {
      const cur = prev[index]
      if (!cur) return prev
      URL.revokeObjectURL(cur.previewUrl)
      const next = [...prev]
      // Viene del editor de imágenes, que solo opera sobre fotos → isVideo:false.
      const nextDraft = {
        file,
        previewUrl: URL.createObjectURL(file),
        capturedAt: null,
        isVideo: false,
      }
      next[index] = nextDraft
      photoDraftsRef.current = next
      trackPhotoMetadata(nextDraft)
      return next
    })
  }

  /**
   * φ-photo-polish: marca una foto como la "portada" del episodio
   * moviéndola al inicio del array. La primera foto es la que se ve
   * por default en el visor (y la única que sale en AlbumGrid como
   * preview). Sin esto el orden lo dictaba el orden de selección,
   * que no siempre es lo que el usuario quiere mostrar primero.
   */
  function setPrimaryPhoto(index: number) {
    setPhotoDrafts((prev) => {
      if (index <= 0 || index >= prev.length) return prev
      const next = [...prev]
      const [picked] = next.splice(index, 1)
      if (!picked) return prev
      next.unshift(picked)
      photoDraftsRef.current = next
      return next
    })
  }

  /**
   * ψ-photos-rich: mover una foto una posición hacia atrás o adelante.
   * El usuario reordena con botones ◄ ► visibles al hover sin necesidad
   * de drag-and-drop. Si está en los bordes (idx=0 y dir=-1, o idx=N-1
   * y dir=+1) es no-op.
   */
  function movePhoto(index: number, dir: -1 | 1) {
    setPhotoDrafts((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]
      const swap = next[target]
      if (tmp === undefined || swap === undefined) return prev
      next[index] = swap
      next[target] = tmp
      photoDraftsRef.current = next
      return next
    })
  }

  function clearPhotoDrafts() {
    for (const d of photoDrafts) URL.revokeObjectURL(d.previewUrl)
    photoDraftsRef.current = []
    setPhotoDrafts([])
  }

  async function fetchPreview() {
    const url = recorteUrl.trim()
    if (!url || previewing) return
    setPreviewing(true)
    try {
      const preview = await api.momentoUrlPreview(url)
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
    clearPhotoDrafts()
    clearAudio()
    setPhotoCaption('')
    setPhotoNote('')
    updatePhotoDateMode('now')
    updateCustomPhotoCapturedAt('')
    setPhotoUploadProgress(null)
  }

  const photoCapturedAtSuggestion = pickOldestCapturedAt(
    photoDrafts.map((draft) => draft.capturedAt),
  )

  function selectedPhotoCapturedAt(drafts = photoDraftsRef.current): string | undefined {
    const suggestion = pickOldestCapturedAt(drafts.map((draft) => draft.capturedAt))
    if (photoDateModeRef.current === 'photo') return suggestion ?? undefined
    if (photoDateModeRef.current === 'custom' && customPhotoCapturedAtRef.current) {
      const date = new Date(customPhotoCapturedAtRef.current)
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
    }
    return undefined
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

    // kind === 'foto' — υ-multi: subir múltiples imágenes en paralelo
    // (cada una pasa por compresión client-side primero) y armar el
    // payload con items[]. Si una falla, abortamos toda la operación
    // y avisamos al usuario — mejor "nada o todo" que "subiste 2 de 4
    // y vimos un error confuso".
    if (photoDrafts.length === 0) {
      toast.show({ message: 'Elige al menos una imagen', tone: 'default' })
      return
    }
    if (photoMetadataTasksRef.current.length > 0) {
      await Promise.allSettled(photoMetadataTasksRef.current)
    }
    setPhotoUploading(true)
    const draftsForSubmit = photoDraftsRef.current
    setPhotoUploadProgress({ done: 0, total: draftsForSubmit.length })
    try {
      const itemsRaw = await Promise.all(
        draftsForSubmit.map(async (draft) => {
          if (draft.isVideo) {
            // ω-video: los clips se suben tal cual —transcodificar en el
            // cliente exigiría una lib pesada—. Solo leemos sus dimensiones
            // para conservar el aspect-ratio al reproducir.
            const dims = await readVideoDimensions(draft.file)
            const uploaded = await api.momentoUpload(draft.file)
            setPhotoUploadProgress((prev) =>
              prev ? { done: prev.done + 1, total: prev.total } : prev,
            )
            return {
              storageKey: uploaded.storageKey,
              width: dims.width || undefined,
              height: dims.height || undefined,
              type: 'video' as const,
            }
          }
          // 1. Comprimir client-side (resize a max 2400px + JPEG q0.85).
          //    Si la imagen ya es chica/eficiente, compressImage devuelve
          //    el File original.
          const compressed = await compressImage(draft.file)
          // 2. Leer dimensiones del archivo comprimido (porque puede
          //    haber sido reescalado).
          const dims = await readImageDimensions(compressed)
          // 3. Upload.
          const uploaded = await api.momentoUpload(compressed)
          setPhotoUploadProgress((prev) =>
            prev ? { done: prev.done + 1, total: prev.total } : prev,
          )
          return {
            storageKey: uploaded.storageKey,
            width: dims.width || undefined,
            height: dims.height || undefined,
          }
        }),
      )
      // Nota de voz: si hay una elegida, la subimos al mismo store y
      // guardamos su storageKey en payload.audioKey.
      let audioKey: string | undefined
      if (audioDraft) {
        const uploadedAudio = await api.momentoAudioUpload(audioDraft.file)
        audioKey = uploadedAudio.storageKey
      }
      // Para back-compat del render de single-foto: también guardamos
      // el primer storageKey en el campo legacy. Renders viejos siguen
      // mostrando la primera foto; renders nuevos prefieren `items[]`.
      const [first] = itemsRaw
      const payload: MomentoPayload = {
        items: itemsRaw,
        storageKey: first?.storageKey,
        width: first?.width,
        height: first?.height,
        caption: photoCaption.trim() || undefined,
        audioKey,
      }
      const created = await addMomento.mutateAsync({
        kind: 'foto',
        payload,
        note: photoNote.trim() || undefined,
        capturedAt: selectedPhotoCapturedAt(),
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
      setPhotoUploadProgress(null)
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

    // Foto — υ-multi: API basada en array de drafts
    photoDrafts,
    addPhotoFiles,
    removePhotoDraft,
    replacePhotoDraft,
    setPrimaryPhoto,
    movePhoto,
    clearPhotoDrafts,
    photoCaption,
    setPhotoCaption,
    photoNote,
    setPhotoNote,
    photoCapturedAtSuggestion,
    photoDateMode,
    setPhotoDateMode: updatePhotoDateMode,
    customPhotoCapturedAt,
    setCustomPhotoCapturedAt: updateCustomPhotoCapturedAt,
    photoUploading,
    photoUploadProgress,
    // Nota de voz
    audioDraft,
    setAudioFile,
    clearAudio,

    // Submit
    submit,
    isPending: addMomento.isPending || photoUploading,
  }
}
