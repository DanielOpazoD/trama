import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useCreateNote,
  useUploadNotasAttachment,
  useCreateRecorte,
  useToast,
} from '../../state'
import { hostLabel } from '../../lib/captureIntent'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { compressImage } from '../momentos/helpers'
import {
  captureMediaSuccessMessage,
  isCaptureMediaFile,
  isNotasComposerActive,
  resolveLinkDraft,
} from './notasComposerModel'

/**
 * Estado + lógica de captura del composer del feed de Notas (nota · enlace ·
 * imagen). Extraído de NotasFeedView para que la vista quede como orquestador y
 * la lógica de captura sea testeable en aislamiento — mismo patrón que
 * useMomentoComposer.
 *
 * El composer es autónomo: instancia sus propias mutaciones
 * (createNote/uploadAttachment/createRecorte) y no recibe props. Devuelve el
 * estado y los handlers que consumen NotasFeedComposer (pie de captura),
 * FocusedWriting (overlay) y la navegación por teclado (focusComposer).
 */
export function useNotasComposer() {
  const createNote = useCreateNote()
  const uploadAttachment = useUploadNotasAttachment()
  const createRecorte = useCreateRecorte()
  const toast = useToast()
  const reducedMotion = usePrefersReducedMotion()

  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const composerRef = useAutosizeTextarea(draft, { minRows: 3, maxRows: 12 })
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  // El usuario pegó un enlace solo; el composer ofrece guardarlo como recorte.
  // `forceNote` deja anular esa heurística y guardarlo igual como nota.
  const [forceNote, setForceNote] = useState(false)
  // Resalte del composer mientras se arrastra una imagen encima.
  const [dragging, setDragging] = useState(false)
  // Cuántas imágenes se están subiendo ahora (para tarjetas «subiendo…»).
  const [uploadingImages, setUploadingImages] = useState(0)
  // Foco editorial del composer: ilumina el borde + anillo tintado mientras se
  // escribe, y revela las afordancias del pie (no están siempre a la vista).
  const [composerFocused, setComposerFocused] = useState(false)
  // Escritura enfocada del cuerpo del composer (overlay fullscreen).
  const [focusMode, setFocusMode] = useState(false)
  // Micro-confirmación al guardar una nota: una onda + ✓ silenciosos sobre el
  // botón guardar (check-pop + saved-ripple). La app no celebra; hace lugar.
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<number | null>(null)

  // El borrador es un enlace puro (y el usuario no eligió "guardar como nota").
  const linkUrl = resolveLinkDraft(draft, forceNote)
  const isLinkDraft = linkUrl !== null

  // El composer está "activo" si tiene foco o algún contenido. Las afordancias
  // del pie (tip de imagen + guardar) solo aparecen entonces — en reposo el
  // composer es una hoja limpia. Con contenido sigue visible aunque pierda el
  // foco, así el click en «guardar» nunca se desmonta antes de registrar.
  const composerActive = isNotasComposerActive({
    composerFocused,
    draft,
    title,
    pendingFilesCount: pendingFiles.length,
  })

  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    }
  }, [])

  /** Foco al composer (afordancia de teclado `n` + empty state). */
  const focusComposer = useCallback(() => composerRef.current?.focus(), [composerRef])

  /** Dispara la micro-confirmación de guardado (callada). */
  function flashSaved() {
    if (reducedMotion) return
    setJustSaved(true)
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 700)
  }

  /** Guarda el borrador-enlace como recorte web (captura de 1 paso). */
  function saveLink(url: string) {
    if (createRecorte.isPending) return
    createRecorte.mutate(
      { kind: 'link', url, title: title.trim() || hostLabel(url) },
      {
        onSuccess: () => {
          setDraft('')
          setTitle('')
          setForceNote(false)
          flashSaved()
          toast.show({
            message: 'Enlace guardado en tus capturas para curar.',
            tone: 'success',
          })
        },
        onError: (e) =>
          toast.show({
            message: e instanceof Error ? e.message : 'No se pudo guardar el enlace',
            tone: 'error',
          }),
      },
    )
  }

  /** Sube y captura imágenes/videos como recortes visuales.
   *  Las comprime client-side (downscale + JPEG) antes de subir, igual que el
   *  composer de Momentos — evita subir un screenshot de 8 MB tal cual. */
  async function captureMediaFiles(files: File[]) {
    const media = files.filter(isCaptureMediaFile)
    if (media.length === 0) return
    // Mostramos las tarjetas «subiendo…» desde ya (incluye la compresión).
    setUploadingImages((n) => n + media.length)
    let done = 0
    for (const original of media) {
      const isVideo = original.type.startsWith('video/')
      const file = isVideo
        ? original
        : await compressImage(original).catch(() => original)
      createRecorte.mutate(
        { kind: isVideo ? 'video' : 'image', file },
        {
          onSuccess: () => {
            done += 1
            if (done === media.length) {
              toast.show({
                message: captureMediaSuccessMessage(media),
                tone: 'success',
              })
            }
          },
          onError: (e) =>
            toast.show({
              message: e instanceof Error ? e.message : 'No se pudo guardar la imagen',
              tone: 'error',
            }),
          onSettled: () => setUploadingImages((n) => Math.max(0, n - 1)),
        },
      )
    }
  }

  /** Pegar imagen(es) las adjunta a la nota en curso (anexos pendientes), no
   *  las captura como recorte suelto — el pegado acompaña lo que se escribe.
   *  (Soltar una imagen sí crea un recorte; ver onComposerDrop.) */
  function onComposerPaste(e: React.ClipboardEvent) {
    const images = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (images.length > 0) {
      e.preventDefault()
      setPendingFiles((prev) => [...prev, ...images])
    }
  }

  /** Soltar imágenes/videos sobre el composer las captura como recortes. */
  function onComposerDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files)
    // Prevenir el default del browser ante CUALQUIER archivo soltado: si solo se
    // previene para media, soltar un archivo no soportado cae al default del
    // navegador (abre el archivo / navega fuera) y se pierde el borrador.
    if (files.length > 0) e.preventDefault()
    const media = files.filter(isCaptureMediaFile)
    if (media.length > 0) {
      captureMediaFiles(media)
    } else if (files.length > 0) {
      // Feedback explícito: sin esto, soltar un archivo no soportado quedaba
      // silencioso tras prevenir el default.
      toast.show({ message: 'Solo se pueden soltar imágenes o videos.', tone: 'default' })
    }
    setDragging(false)
  }

  function onCaptureMediaInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? [])
    if (files.length > 0) void captureMediaFiles(files)
    e.currentTarget.value = ''
  }

  function save() {
    if (isLinkDraft && linkUrl) {
      saveLink(linkUrl)
      return
    }
    const content = draft.trim()
    if (!content || createNote.isPending) return
    const files = pendingFiles
    createNote.mutate(
      { content, title: title.trim() || null },
      {
        onSuccess: async (note) => {
          setDraft('')
          setTitle('')
          setForceNote(false)
          setPendingFiles([])
          flashSaved()
          if (files.length === 0) return
          try {
            await Promise.all(
              files.map((file) =>
                uploadAttachment.mutateAsync({
                  ownerType: 'note',
                  ownerId: note.id,
                  file,
                }),
              ),
            )
            toast.show({ message: 'Nota y anexos guardados.', tone: 'success' })
          } catch (err) {
            toast.show({
              message:
                err instanceof Error
                  ? err.message
                  : 'La nota se guardó, pero algún anexo falló.',
              tone: 'error',
            })
          }
        },
        onError: (e) =>
          toast.show({
            message: e instanceof Error ? e.message : 'No se pudo guardar la nota',
            tone: 'error',
          }),
      },
    )
  }

  function onComposerKey(e: React.KeyboardEvent) {
    // ⌘/Ctrl + Enter guarda (como en chat/markdown editors).
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  return {
    // estado expuesto al pie de captura (NotasFeedComposer) y al overlay
    draft,
    setDraft,
    title,
    setTitle,
    pendingFiles,
    setPendingFiles,
    composerRef,
    dragging,
    setDragging,
    uploadingImages,
    composerFocused,
    setComposerFocused,
    focusMode,
    setFocusMode,
    justSaved,
    isLinkDraft,
    composerActive,
    createNoteBusy: createNote.isPending,
    uploadAttachmentBusy: uploadAttachment.isPending,
    createRecorteBusy: createRecorte.isPending,
    // acciones
    focusComposer,
    save,
    setForceNote,
    onComposerPaste,
    onComposerDrop,
    onCaptureMediaInput,
    onComposerKey,
  }
}
