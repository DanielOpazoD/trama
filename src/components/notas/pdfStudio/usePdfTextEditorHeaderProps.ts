import type { Dispatch, SetStateAction } from 'react'
import type { Annotation, PdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import {
  canRedo,
  canUndo,
  redo,
  undo,
  type History,
} from '../../../lib/pdfStudio/history'
import type { PdfTextEditorResult } from './pdfTextEditorResult'

type PdfTextEditorHistory = History<Record<number, Annotation[]>>

export function usePdfTextEditorHeaderProps({
  currentEdits,
  currentPage,
  displayZoom,
  fillMode,
  goToPage,
  history,
  onClose,
  onPrint,
  onSaveCopy,
  prepareZoomAnchor,
  setEditingId,
  setHistory,
  setSelectedId,
  stepZoomIn,
  stepZoomOut,
  total,
  zoomInDisabled,
  zoomOutDisabled,
  changeZoom,
}: {
  currentEdits: () => {
    annotations: Record<number, Annotation[]>
    formFields: PdfFormFieldDraft[]
  }
  currentPage: number
  displayZoom: number
  fillMode: boolean
  goToPage: (page: number) => void
  history: PdfTextEditorHistory
  onClose: (edits: PdfTextEditorResult | null) => void
  onPrint?: (edits: PdfTextEditorResult) => void
  onSaveCopy?: (edits: PdfTextEditorResult) => void
  prepareZoomAnchor: () => void
  setEditingId: (id: string | null) => void
  setHistory: Dispatch<SetStateAction<PdfTextEditorHistory>>
  setSelectedId: (id: string | null) => void
  stepZoomIn: () => void
  stepZoomOut: () => void
  total: number
  zoomInDisabled: boolean
  zoomOutDisabled: boolean
  changeZoom: (zoom: number) => void
}) {
  const clearObjectSelection = () => {
    setSelectedId(null)
    setEditingId(null)
  }
  return {
    currentPage,
    total,
    undoable: canUndo(history),
    redoable: canRedo(history),
    onPrevPage: () => goToPage(currentPage - 1),
    onNextPage: () => goToPage(currentPage + 1),
    onUndo: () => {
      clearObjectSelection()
      setHistory(undo)
    },
    onRedo: () => {
      clearObjectSelection()
      setHistory(redo)
    },
    onCancel: () => onClose(null),
    onDone: () => onClose(currentEdits()),
    onPrint: fillMode ? () => onPrint?.(currentEdits()) : undefined,
    onSaveCopy: fillMode ? () => onSaveCopy?.(currentEdits()) : undefined,
    showHistory: !fillMode,
    showPrimaryAction: !fillMode,
    title: fillMode ? 'Rellenar planilla' : undefined,
    onPrepareZoomAnchor: fillMode ? prepareZoomAnchor : undefined,
    onZoomIn: fillMode ? stepZoomIn : undefined,
    onZoomOut: fillMode ? stepZoomOut : undefined,
    onZoomChange: fillMode ? changeZoom : undefined,
    zoom: fillMode ? displayZoom : undefined,
    zoomInDisabled,
    zoomOutDisabled,
  }
}
