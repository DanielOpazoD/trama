import { describe, expect, it } from 'vitest'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import { applyTemplateAutoFill, localTodayIso } from './pdfTemplateFillValues'

const base = {
  id: 'f',
  pageId: 'p1',
  name: 'campo',
  xRatio: 0,
  yRatio: 0,
  wRatio: 0.1,
  hRatio: 0.05,
}

describe('applyTemplateAutoFill', () => {
  it('llena con hoy s\u00f3lo fechas marcadas y vac\u00edas', () => {
    const fields: PdfFormFieldDraft[] = [
      { ...base, id: 'a', fieldKind: 'date', value: '', autoFill: 'today' },
      { ...base, id: 'b', fieldKind: 'date', value: '2020-01-01', autoFill: 'today' },
      { ...base, id: 'c', fieldKind: 'date', value: '' },
      { ...base, id: 'd', fieldKind: 'text', value: '', autoFill: 'today' },
    ]
    const out = applyTemplateAutoFill(fields, '2026-07-03')
    expect(out.map((field) => field.value)).toEqual(['2026-07-03', '2020-01-01', '', ''])
  })

  it('localTodayIso da YYYY-MM-DD local', () => {
    expect(localTodayIso(new Date(2026, 6, 3, 23, 59))).toBe('2026-07-03')
  })
})
