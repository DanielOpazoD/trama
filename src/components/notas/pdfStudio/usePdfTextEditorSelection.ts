import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Annotation } from '../../../lib/pdfStudio/model'
import {
  alignAnnotations,
  annotationArrangeBox,
  annotationSelectionBox,
  distributeAnnotations,
  groupAnnotations,
  moveAnnotationLayer,
  setAnnotationsLocked,
  ungroupAnnotations,
  type AnnotationArrangeGeometry,
  type AnnotationDistributionAxis,
  type AnnotationHorizontalAlignment,
  type AnnotationLayerMove,
} from './pdfAnnotationArrange'
import { applyEditorStylePatch } from './pdfEditorStyleState'
import type { TextStyle } from './editorStyle'

export function usePdfTextEditorSelection({
  annotations,
  arrangeGeometry,
  setAnnotations,
  setStyle,
  clearEditing,
}: {
  annotations: Annotation[]
  arrangeGeometry: AnnotationArrangeGeometry | null
  setAnnotations: (fn: (list: Annotation[]) => Annotation[]) => void
  setStyle: Dispatch<SetStateAction<TextStyle>>
  clearEditing: () => void
}) {
  const [selectedId, setSelectedIdState] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id)
    setSelectedIds(id ? [id] : [])
  }, [])

  const toggleSelectedId = useCallback(
    (id: string) => {
      clearEditing()
      setSelectedIds((current) => {
        const next = current.includes(id)
          ? current.filter((candidate) => candidate !== id)
          : [...current, id]
        setSelectedIdState(next[next.length - 1] ?? null)
        return next
      })
    },
    [clearEditing],
  )

  const liveSelectedIds = useMemo(
    () => selectedIds.filter((id) => annotations.some((a) => a.id === id)),
    [annotations, selectedIds],
  )
  const operationSelectedIds =
    liveSelectedIds.length > 0 ? liveSelectedIds : selectedId ? [selectedId] : []
  const selectedAnn = annotations.find((a) => a.id === selectedId) ?? null
  const selectedBounds =
    selectedAnn && arrangeGeometry
      ? operationSelectedIds.length > 1
        ? annotationSelectionBox(annotations, operationSelectedIds, arrangeGeometry)
        : annotationArrangeBox(selectedAnn, arrangeGeometry)
      : null

  const applyStyle = (patch: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...patch }))
    if (operationSelectedIds.length === 0) return
    setAnnotations((list) =>
      operationSelectedIds.reduce(
        (next, id) =>
          next.find((annotation) => annotation.id === id)?.locked
            ? next
            : applyEditorStylePatch(next, id, patch),
        list,
      ),
    )
  }

  const alignSelection = (alignment: AnnotationHorizontalAlignment) => {
    if (operationSelectedIds.length === 0 || !arrangeGeometry) return
    setAnnotations((list) =>
      alignAnnotations(list, operationSelectedIds, alignment, arrangeGeometry),
    )
  }

  const distributeSelection = (axis: AnnotationDistributionAxis) => {
    if (operationSelectedIds.length < 3 || !arrangeGeometry) return
    setAnnotations((list) =>
      distributeAnnotations(list, operationSelectedIds, axis, arrangeGeometry),
    )
  }

  const moveSelectionLayer = (move: AnnotationLayerMove) => {
    if (!selectedId) return
    setAnnotations((list) => moveAnnotationLayer(list, selectedId, move))
  }

  const toggleSelectionLocked = (locked: boolean) => {
    if (operationSelectedIds.length === 0) return
    setAnnotations((list) => setAnnotationsLocked(list, operationSelectedIds, locked))
  }

  const groupSelection = () => {
    if (operationSelectedIds.length < 2) return
    setAnnotations((list) =>
      groupAnnotations(list, operationSelectedIds, `g-${Date.now().toString(36)}`),
    )
  }

  const ungroupSelection = () => {
    if (operationSelectedIds.length === 0) return
    setAnnotations((list) => ungroupAnnotations(list, operationSelectedIds))
  }

  const removeAnnotation = (id: string) => {
    const target = annotations.find((a) => a.id === id)
    if (target?.locked) return
    setAnnotations((list) => list.filter((a) => a.id !== id))
    if (!selectedIds.includes(id)) return
    const next = selectedIds.filter((candidate) => candidate !== id)
    setSelectedIds(next)
    setSelectedIdState(next[next.length - 1] ?? null)
  }

  return {
    selectedId,
    selectedIds: operationSelectedIds,
    selectedAnn,
    selectedBounds,
    setSelectedId,
    toggleSelectedId,
    applyStyle,
    alignSelection,
    distributeSelection,
    moveSelectionLayer,
    toggleSelectionLocked,
    groupSelection,
    ungroupSelection,
    removeAnnotation,
  }
}
