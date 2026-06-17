import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CaptureItem } from '../../api/notasFeed'
import type { RecorteThumbSize } from '../../hooks/useRecorteThumbSize'

type MeasurableVirtualizer = {
  measure: () => void
}

export function feedMeasureSignature(items: CaptureItem[]): string {
  return items
    .map((item) =>
      item.type === 'note'
        ? `n:${item.id}:${item.note.updatedAt}:${item.note.hasImages ? 1 : 0}`
        : `r:${item.id}:${item.recorte.updatedAt}:${item.recorte.imageKey ?? ''}:${
            item.recorte.imageUrl ?? ''
          }:${item.recorte.text.length}`,
    )
    .join('|')
}

export function useMeasuredVirtualFeed({
  items,
  recorteThumb,
  virtualizer,
}: {
  items: CaptureItem[]
  recorteThumb: RecorteThumbSize
  virtualizer: MeasurableVirtualizer
}) {
  const virtualizerRef = useRef(virtualizer)

  useEffect(() => {
    virtualizerRef.current = virtualizer
  }, [virtualizer])

  const measureSignature = useMemo(() => feedMeasureSignature(items), [items])

  useLayoutEffect(() => {
    if (items.length === 0) return
    virtualizerRef.current.measure()
  }, [items.length, measureSignature, recorteThumb])
}
