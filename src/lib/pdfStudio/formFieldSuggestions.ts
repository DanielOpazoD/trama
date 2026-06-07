import { makePdfFormFieldDraft } from './modelForms'
import type { PdfFormFieldDraft } from './modelTypes'

export type HorizontalRun = { x: number; y: number; width: number; height: number }

type ExistingFieldBox = Pick<
  PdfFormFieldDraft,
  'pageId' | 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'
>

export function suggestTextFieldsFromHorizontalRuns(input: {
  pageId: string
  pageWidth: number
  pageHeight: number
  runs: HorizontalRun[]
  existingFields?: ExistingFieldBox[]
}): PdfFormFieldDraft[] {
  const minWidth = Math.max(80, input.pageWidth * 0.12)
  const fieldHeightPx = Math.max(26, input.pageHeight * 0.045)
  const candidates = input.runs
    .filter((run) => run.width >= minWidth && run.height <= 8)
    .map((run) => ({
      xRatio: clamp01(run.x / input.pageWidth),
      yRatio: clamp01((run.y - fieldHeightPx * 0.62) / input.pageHeight),
      wRatio: clamp01(run.width / input.pageWidth),
      hRatio: clamp01(fieldHeightPx / input.pageHeight),
    }))
    .sort((a, b) => a.yRatio - b.yRatio || a.xRatio - b.xRatio)

  const accepted: Array<
    Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>
  > = []
  for (const candidate of candidates) {
    if (
      [
        ...accepted,
        ...(input.existingFields ?? []).filter((f) => f.pageId === input.pageId),
      ].some((box) => boxesClose(candidate, box))
    ) {
      continue
    }
    accepted.push(candidate)
  }

  return accepted.map((box, index) =>
    makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: input.pageId,
      name: `campo_${index + 1}`,
      value: '',
      ...box,
    }),
  )
}

function boxesClose(
  a: Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>,
  b: Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>,
): boolean {
  const ax = a.xRatio + a.wRatio / 2
  const ay = a.yRatio + a.hRatio / 2
  const bx = b.xRatio + b.wRatio / 2
  const by = b.yRatio + b.hRatio / 2
  return Math.abs(ax - bx) < 0.05 && Math.abs(ay - by) < 0.055
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export async function detectHorizontalRunsFromImage(
  src: string,
  maxWidth = 900,
): Promise<{ runs: HorizontalRun[]; width: number; height: number }> {
  const image = await loadImage(src)
  const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { runs: [], width, height }
  ctx.drawImage(image, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height)
  return { runs: detectHorizontalRunsFromPixels(data.data, width, height), width, height }
}

export function detectHorizontalRunsFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HorizontalRun[] {
  const minRun = Math.max(70, width * 0.1)
  const rows: HorizontalRun[] = []
  for (let y = Math.round(height * 0.04); y < height * 0.96; y += 1) {
    let start = -1
    for (let x = Math.round(width * 0.04); x < width * 0.96; x += 1) {
      const i = (y * width + x) * 4
      const dark = data[i]! < 115 && data[i + 1]! < 115 && data[i + 2]! < 115
      if (dark && start < 0) start = x
      if ((!dark || x >= width * 0.96 - 1) && start >= 0) {
        const end = dark ? x : x - 1
        const runWidth = end - start + 1
        if (runWidth >= minRun) rows.push({ x: start, y, width: runWidth, height: 1 })
        start = -1
      }
    }
  }
  return mergeNearbyRuns(rows)
}

function mergeNearbyRuns(runs: HorizontalRun[]): HorizontalRun[] {
  const merged: HorizontalRun[] = []
  for (const run of runs) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      Math.abs(run.y - (prev.y + prev.height - 1)) <= 2 &&
      Math.abs(run.x - prev.x) <= 8 &&
      Math.abs(run.width - prev.width) <= 20
    ) {
      prev.height = run.y - prev.y + 1
      prev.x = Math.min(prev.x, run.x)
      const right = Math.max(prev.x + prev.width, run.x + run.width)
      prev.width = right - prev.x
    } else {
      merged.push({ ...run })
    }
  }
  return merged
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error('No se pudo leer la página para sugerir casilleros'))
    image.src = src
  })
}
