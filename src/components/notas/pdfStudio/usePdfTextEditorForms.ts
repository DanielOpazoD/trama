import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  makePdfFormFieldDraft,
  type PdfDoc,
  type PdfFormFieldDraft,
  type PdfFormFieldKind,
  type PdfFormValue,
  type PdfPage,
} from '../../../lib/pdfStudio/model'
import {
  resizeRatioBox,
  screenDeltaToPage,
  type PageLayout,
  type ResizeHandle,
} from '../../../lib/pdfStudio/editorGeometry'
import type { Tool } from './editorStyle'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function defaultFormValue(kind: PdfFormFieldKind): PdfFormValue {
  if (kind === 'checkbox') return false
  if (kind === 'radio') return null
  return ''
}

function fieldNamePrefix(kind: PdfFormFieldKind): string {
  if (kind === 'date') return 'fecha'
  if (kind === 'checkbox') return 'checkbox'
  if (kind === 'radio') return 'radio'
  if (kind === 'signature') return 'firma'
  return 'campo'
}

function initialFieldBox(kind: PdfFormFieldKind) {
  if (kind === 'checkbox' || kind === 'radio') {
    return { xRatio: 0.24, yRatio: 0.42, wRatio: 0.045, hRatio: 0.045 }
  }
  if (kind === 'signature') {
    return { xRatio: 0.22, yRatio: 0.42, wRatio: 0.32, hRatio: 0.11 }
  }
  return { xRatio: 0.2, yRatio: 0.42, wRatio: 0.32, hRatio: 0.055 }
}

export function usePdfTextEditorForms({
  doc,
  page,
  layout,
  zoom,
  setTool,
  setEditingId,
  setSelectedId,
}: {
  doc: PdfDoc
  page: PdfPage | undefined
  layout: PageLayout | null
  zoom: number
  setTool: (tool: Tool) => void
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
}) {
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const signatureTargetRef = useRef<string | null>(null)
  const [formFields, setFormFields] = useState<PdfFormFieldDraft[]>(
    () => doc.formFields ?? [],
  )
  const [selectedFormFieldId, setSelectedFormFieldId] = useState<string | null>(null)
  const [signatureField, setSignatureField] = useState<PdfFormFieldDraft | null>(null)
  const visibleDraftFields = page
    ? formFields.filter((field) => field.pageId === page.id)
    : []

  function nextFormFieldName(kind: PdfFormFieldKind): string {
    const prefix = fieldNamePrefix(kind)
    const used = new Set(formFields.map((field) => field.name))
    let i = used.size + 1
    while (used.has(`${prefix}_${i}`)) i += 1
    return `${prefix}_${i}`
  }

  function addFormField(kind: PdfFormFieldKind) {
    if (!page) return
    const field = makePdfFormFieldDraft({
      fieldKind: kind,
      pageId: page.id,
      name: nextFormFieldName(kind),
      value: defaultFormValue(kind),
      options: kind === 'radio' ? ['Sí'] : undefined,
      ...initialFieldBox(kind),
    })
    setTool('select')
    setEditingId(null)
    setSelectedId(null)
    setFormFields((fields) => [...fields, field])
    setSelectedFormFieldId(field.id)
  }

  function updateDraftFormValue(id: string, value: string | boolean) {
    setFormFields((fields) =>
      fields.map((field) => (field.id === id ? { ...field, value } : field)),
    )
  }

  function openSignature(field: PdfFormFieldDraft) {
    setSignatureField(field)
  }

  function chooseSignatureImage(field = signatureField) {
    if (!field) return
    signatureTargetRef.current = field.id
    signatureInputRef.current?.click()
  }

  function setSignatureFile(file: File) {
    const target = signatureTargetRef.current
    if (!target) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') updateDraftFormValue(target, reader.result)
      setSignatureField(null)
    }
    reader.readAsDataURL(file)
  }

  function saveSignatureDataUrl(dataUrl: string) {
    const target = signatureField?.id
    if (!target) return
    updateDraftFormValue(target, dataUrl)
    setSignatureField(null)
  }

  function selectDraftFormField(id: string) {
    setSelectedFormFieldId(id)
    setSelectedId(null)
    setEditingId(null)
  }

  function startDraftDrag(e: ReactPointerEvent, field: PdfFormFieldDraft) {
    if (!layout || field.readOnly) return
    e.stopPropagation()
    const dw = layout.innerW * zoom
    const dh = layout.innerH * zoom
    const startX = e.clientX
    const startY = e.clientY
    const rot = layout.rot
    const move = (ev: PointerEvent) => {
      const { dx, dy } = screenDeltaToPage(ev.clientX - startX, ev.clientY - startY, rot)
      const xRatio = clamp01(field.xRatio + dx / dw)
      const yRatio = clamp01(field.yRatio + dy / dh)
      setFormFields((fields) =>
        fields.map((item) =>
          item.id === field.id
            ? {
                ...item,
                xRatio: Math.min(1 - item.wRatio, xRatio),
                yRatio: Math.min(1 - item.hRatio, yRatio),
              }
            : item,
        ),
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startDraftResize(
    e: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) {
    if (!layout || field.readOnly) return
    e.stopPropagation()
    e.preventDefault()
    const dw = layout.innerW * zoom
    const dh = layout.innerH * zoom
    const startX = e.clientX
    const startY = e.clientY
    const rot = layout.rot
    const move = (ev: PointerEvent) => {
      const { dx, dy } = screenDeltaToPage(ev.clientX - startX, ev.clientY - startY, rot)
      const next = resizeRatioBox(field, handle, dx / dw, dy / dh, {
        minW: 14 / dw,
        minH: 14 / dh,
      })
      setFormFields((fields) =>
        fields.map((item) => (item.id === field.id ? { ...item, ...next } : item)),
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return {
    addFormField,
    formFields,
    openSignature,
    selectedFormFieldId,
    selectDraftFormField,
    chooseSignatureImage,
    saveSignatureDataUrl,
    setSignatureFile,
    setSignatureField,
    signatureField,
    signatureInputRef,
    startDraftDrag,
    startDraftResize,
    updateDraftFormValue,
    visibleDraftFields,
  }
}
