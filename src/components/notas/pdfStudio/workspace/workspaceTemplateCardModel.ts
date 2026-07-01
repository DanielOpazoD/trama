import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'

export function workspaceTemplateSavedAtLabel(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()}/${d.getMonth() + 1} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function workspaceTemplateFieldCountLabel(doc: PdfDoc) {
  const count = doc.formFields?.length ?? 0
  return `${count} ${count === 1 ? 'campo' : 'campos'}`
}
