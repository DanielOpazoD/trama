import {
  deletePages,
  duplicatePages,
  emptyDoc,
  getSource,
  movePage,
  movePageByDelta,
  movePages,
  pageThumbKey,
  replacePageWithImage,
  rotatePages,
  subsetDoc,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import { forgetThumb } from '../../../../lib/pdfStudio/render/pdfRender'
import { editImage } from '../../../../lib/imageEditor'

export function usePdfStudioPageActions({
  clearDraft,
  clearSelection,
  commit,
  doc,
  exportPdf,
  resetTemplateMode,
  selectedCount,
  selectedIndices,
  userKey,
}: {
  clearDraft: (userKey: string) => void | Promise<void>
  clearSelection: () => void
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
  doc: PdfDoc
  exportPdf: (target: PdfDoc, kind?: string) => void | Promise<void>
  resetTemplateMode: () => void
  selectedCount: number
  selectedIndices: number[]
  userKey: string
}) {
  function forgetRemovedThumbs(indices: number[]) {
    const drop = new Set(indices)
    const surviving = new Set(doc.pages.filter((_, i) => !drop.has(i)).map(pageThumbKey))
    for (const i of indices) {
      const page = doc.pages[i]
      if (page && !surviving.has(pageThumbKey(page))) forgetThumb(pageThumbKey(page))
    }
  }

  function bulkDelete() {
    if (selectedCount === 0) return
    forgetRemovedThumbs(selectedIndices)
    commit((d) => deletePages(d, selectedIndices))
    clearSelection()
  }

  function newDoc() {
    commit(emptyDoc())
    clearSelection()
    resetTemplateMode()
    void clearDraft(userKey)
  }

  async function cropSelectedImage() {
    if (selectedCount !== 1) return
    const index = selectedIndices[0]
    if (index == null) return
    const page = doc.pages[index]
    if (!page || page.kind !== 'image') return
    const source = getSource(doc, page.sourceId)
    if (!source || source.kind !== 'image') return
    const edited = await editImage(source.file, {
      outputType: 'image/webp',
      title: 'Imagen de Imprenta',
    })
    if (!edited || edited === source.file) return
    forgetThumb(pageThumbKey(page))
    commit((d) => replacePageWithImage(d, index, edited))
    clearSelection()
  }

  const selectedImagePage =
    selectedCount === 1 && selectedIndices[0] != null
      ? doc.pages[selectedIndices[0]]
      : null

  return {
    bulkDelete,
    bulkDuplicate: () =>
      selectedCount > 0 && commit((d) => duplicatePages(d, selectedIndices)),
    bulkRotate: (delta: -1 | 1) =>
      selectedCount > 0 && commit((d) => rotatePages(d, selectedIndices, delta)),
    canCropSelectedImage: selectedImagePage?.kind === 'image',
    cropSelectedImage,
    exportMarked: () =>
      selectedIndices.length > 0 &&
      void exportPdf(subsetDoc(doc, selectedIndices), 'seleccion'),
    newDoc,
    nudge: (index: number, delta: -1 | 1) =>
      commit((d) => movePageByDelta(d, index, delta)),
    reorder: (from: number, to: number, movingIndices?: number[]) =>
      commit((d) =>
        movingIndices && movingIndices.length > 1
          ? movePages(d, movingIndices, to)
          : movePage(d, from, to),
      ),
  }
}
