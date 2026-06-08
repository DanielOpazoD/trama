import { useRef, useState } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model/model'

export function usePdfTextEditorFormSignature({
  updateDraftFormValue,
}: {
  updateDraftFormValue: (id: string, value: string | boolean) => void
}) {
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const signatureTargetRef = useRef<string | null>(null)
  const [signatureField, setSignatureField] = useState<PdfFormFieldDraft | null>(null)

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

  return {
    chooseSignatureImage,
    openSignature,
    saveSignatureDataUrl,
    setSignatureField,
    setSignatureFile,
    signatureField,
    signatureInputRef,
  }
}
