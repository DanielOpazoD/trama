import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { redo, undo, type History } from '../../../../lib/pdfStudio/model/history'
import type { Annotation } from '../../../../lib/pdfStudio/model/model'
import { reduceAnnotationShortcut } from './pdfAnnotationShortcuts'

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!(
    el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  )
}

export function usePdfTextEditorKeyboard({
  editingRef,
  selectedRef,
  annotationsRef,
  annotationClipboardRef,
  formUndoRef,
  setSelectedId,
  setEditingId,
  setHistory,
  setAnnotations,
  onClose,
}: {
  editingRef: RefObject<string | null>
  selectedRef: RefObject<string | null>
  annotationsRef: { current: Annotation[] }
  annotationClipboardRef: { current: Annotation | null }
  /** Deshacer/rehacer de casilleros (diseño): tiene prioridad sobre el
   *  historial de anotaciones; si devuelve false, cae a las anotaciones. */
  formUndoRef?: RefObject<((redo: boolean) => boolean) | null>
  setSelectedId: (id: string | null) => void
  setEditingId: Dispatch<SetStateAction<string | null>>
  setHistory: Dispatch<SetStateAction<History<Record<number, Annotation[]>>>>
  setAnnotations: (fn: (list: Annotation[]) => Annotation[]) => void
  onClose: (edits: null) => void
}) {
  // Escape en dos etapas: primero cierra edición/selección, luego el modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if ((e.target as HTMLElement | null)?.isContentEditable) return
      if (editingRef.current) {
        e.preventDefault()
        setEditingId(null)
        return
      }
      if (selectedRef.current) {
        e.preventDefault()
        setSelectedId(null)
        return
      }
      onClose(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editingRef, onClose, selectedRef, setEditingId, setSelectedId])

  // Undo/redo dentro del modal, sin interceptar inputs/contentEditable.
  // Los casilleros (diseño) tienen prioridad; sin historia de casilleros,
  // el ⌘Z cae al historial de anotaciones.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      if (formUndoRef?.current?.(e.shiftKey)) return
      setSelectedId(null)
      setEditingId(null)
      setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [formUndoRef, setEditingId, setHistory, setSelectedId])

  // Copiar/cortar/pegar/duplicar/eliminar/mover anotaciones seleccionadas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      const currentAnnotations = annotationsRef.current
      const result = reduceAnnotationShortcut({
        annotations: currentAnnotations,
        selectedId: selectedRef.current,
        clipboard: annotationClipboardRef.current,
        key: e.key,
        mod: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
      })
      if (!result.handled) return

      e.preventDefault()
      annotationClipboardRef.current = result.clipboard
      if (result.selectedId !== selectedRef.current) setSelectedId(result.selectedId)
      if (result.annotations !== currentAnnotations) {
        setAnnotations(() => result.annotations)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [annotationClipboardRef, annotationsRef, selectedRef, setAnnotations, setSelectedId])
}
