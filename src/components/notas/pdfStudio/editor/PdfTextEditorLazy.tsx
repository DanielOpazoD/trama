import { lazy, useCallback, useEffect } from 'react'

const loadPdfTextEditor = () =>
  import('./PdfTextEditor').then((module) => ({ default: module.PdfTextEditor }))

export const PdfTextEditor = lazy(loadPdfTextEditor)

function preloadPdfTextEditor(): void {
  void loadPdfTextEditor()
}

export function usePdfTextEditorLoader(
  enabled: boolean,
  setPage: (pageIndex: number) => void,
): (pageIndex: number) => void {
  useEffect(() => {
    if (enabled) preloadPdfTextEditor()
  }, [enabled])

  return useCallback(
    (pageIndex: number) => {
      preloadPdfTextEditor()
      setPage(pageIndex)
    },
    [setPage],
  )
}
