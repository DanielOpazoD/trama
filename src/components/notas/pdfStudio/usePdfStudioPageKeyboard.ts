import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import {
  deletePages,
  insertPages,
  pageThumbKey,
  subsetDoc,
  type PdfDoc,
} from '../../../lib/pdfStudio/model/model'
import { redo, undo, type History } from '../../../lib/pdfStudio/model/history'
import { forgetThumb } from '../../../lib/pdfStudio/render/pdfRender'

export function usePdfStudioPageKeyboard({
  textPage,
  selectedIndicesRef,
  docRef,
  pageClipboardRef,
  selectAllRef,
  clearSelection,
  commit,
  setHistory,
  showToast,
}: {
  textPage: number | null
  selectedIndicesRef: MutableRefObject<number[]>
  docRef: MutableRefObject<PdfDoc>
  pageClipboardRef: MutableRefObject<PdfDoc | null>
  selectAllRef: MutableRefObject<() => void>
  clearSelection: () => void
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
  setHistory: Dispatch<SetStateAction<History<PdfDoc>>>
  showToast: (message: string) => void
}) {
  useEffect(() => {
    const hasTextSelection = () => !!window.getSelection()?.toString()
    const forgetThumbsFor = (indices: number[], from: PdfDoc) => {
      const drop = new Set(indices)
      const surviving = new Set(
        from.pages.filter((_, i) => !drop.has(i)).map(pageThumbKey),
      )
      for (const i of indices) {
        const page = from.pages[i]
        if (page && !surviving.has(pageThumbKey(page))) forgetThumb(pageThumbKey(page))
      }
    }
    const deleteMarked = (indices: number[]) => {
      forgetThumbsFor(indices, docRef.current)
      commit((d) => deletePages(d, indices))
      clearSelection()
    }
    const onKey = (e: KeyboardEvent) => {
      if (textPage !== null) return
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const sel = selectedIndicesRef.current

      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if (mod && key === 'z') {
        e.preventDefault()
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
        return
      }
      if (mod && key === 'a') {
        if (hasTextSelection()) return
        e.preventDefault()
        selectAllRef.current()
        return
      }
      if (mod && (key === 'c' || key === 'x')) {
        if (sel.length === 0 || hasTextSelection()) return
        e.preventDefault()
        pageClipboardRef.current = subsetDoc(docRef.current, sel)
        showToast(
          `${sel.length} ${sel.length === 1 ? 'página copiada' : 'páginas copiadas'}.`,
        )
        if (key === 'x') deleteMarked(sel)
        return
      }
      if (mod && key === 'v') {
        const clip = pageClipboardRef.current
        if (!clip) return
        e.preventDefault()
        const at = sel.length ? Math.max(...sel) + 1 : undefined
        commit((d) => insertPages(d, clip, at))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length === 0) return
        e.preventDefault()
        deleteMarked(sel)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    textPage,
    clearSelection,
    commit,
    docRef,
    pageClipboardRef,
    selectAllRef,
    selectedIndicesRef,
    setHistory,
    showToast,
  ])
}
