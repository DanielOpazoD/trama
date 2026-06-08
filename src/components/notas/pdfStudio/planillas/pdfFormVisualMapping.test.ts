import { describe, expect, it } from 'vitest'
import type { PdfPage } from '../../../../lib/pdfStudio/model/model'
import {
  visualWidgetsForPage,
  type DetectedPdfFormForCanvas,
} from './pdfFormVisualMapping'

const page: PdfPage = {
  id: 'p1',
  kind: 'pdf',
  sourceId: 's1',
  pageIndex: 2,
  annotations: [],
  rotationQuarters: 0,
}

describe('pdfFormVisualMapping', () => {
  it('mapea widgets detectados al canvas de la página PDF actual', () => {
    const forms: DetectedPdfFormForCanvas[] = [
      {
        sourceId: 's1',
        values: { fullName: 'Daniel' },
        fields: [
          {
            name: 'fullName',
            type: 'text',
            value: 'Inicial',
            readOnly: false,
            required: false,
            widgets: [
              {
                pageIndex: 1,
                widgetIndex: 0,
                xRatio: 0.1,
                yRatio: 0.1,
                wRatio: 0.2,
                hRatio: 0.04,
              },
              {
                pageIndex: 2,
                widgetIndex: 1,
                xRatio: 0.2,
                yRatio: 0.3,
                wRatio: 0.35,
                hRatio: 0.04,
              },
            ],
          },
        ],
      },
    ]

    expect(visualWidgetsForPage(page, forms)).toEqual([
      {
        id: 's1:fullName:1',
        sourceId: 's1',
        fieldName: 'fullName',
        type: 'text',
        value: 'Daniel',
        options: undefined,
        readOnly: false,
        xRatio: 0.2,
        yRatio: 0.3,
        wRatio: 0.35,
        hRatio: 0.04,
      },
    ])
  })

  it('no muestra widgets de otras fuentes, imágenes o widgets sin ubicación', () => {
    const forms: DetectedPdfFormForCanvas[] = [
      {
        sourceId: 's2',
        values: {},
        fields: [
          {
            name: 'other',
            type: 'text',
            value: '',
            readOnly: false,
            required: false,
            widgets: [
              {
                pageIndex: 2,
                widgetIndex: 0,
                xRatio: 0,
                yRatio: 0,
                wRatio: 0.2,
                hRatio: 0.04,
              },
            ],
          },
        ],
      },
    ]

    expect(visualWidgetsForPage(page, forms)).toEqual([])
    expect(visualWidgetsForPage({ ...page, kind: 'image' }, forms)).toEqual([])
  })
})
