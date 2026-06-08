import { useEffect } from 'react'
import {
  clearPdfFormFieldValues,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import type { PdfTemplateMode } from '../planillas/design/PdfTemplateModeBanner'

export function usePdfStudioDraftSanitizer({
  mode,
  setDraftSanitizer,
}: {
  mode: PdfTemplateMode | null
  setDraftSanitizer: (sanitize: (draft: PdfDoc) => PdfDoc) => void
}) {
  useEffect(() => {
    setDraftSanitizer((draft) =>
      mode === 'fill' ? clearPdfFormFieldValues(draft) : draft,
    )
  }, [mode, setDraftSanitizer])
}
