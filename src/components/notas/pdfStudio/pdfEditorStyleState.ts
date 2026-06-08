import type { Annotation } from '../../../lib/pdfStudio/model/model'
import type { TextStyle } from './editorStyle'

export function defaultEditorTextStyle(): TextStyle {
  return {
    font: 'sans',
    sizeRatio: 0.04,
    bold: false,
    color: '#222222',
    opacity: 1,
    rotation: 0,
  }
}

export function resolveActiveEditorStyle(
  selected: Annotation | null,
  fallback: TextStyle,
): TextStyle {
  if (!selected) return fallback
  return {
    font: selected.kind === 'text' ? selected.font : fallback.font,
    sizeRatio: selected.kind === 'text' ? selected.sizeRatio : fallback.sizeRatio,
    bold: selected.kind === 'text' ? selected.bold : fallback.bold,
    color: 'color' in selected ? selected.color : fallback.color,
    opacity: selected.opacity ?? fallback.opacity ?? 1,
    rotation: selected.kind === 'text' ? (selected.rotation ?? 0) : fallback.rotation,
  }
}

export function applyEditorStylePatch(
  annotations: Annotation[],
  selectedId: string | null,
  patch: Partial<TextStyle>,
): Annotation[] {
  if (!selectedId) return annotations
  return annotations.map((a) => {
    if (a.id !== selectedId) return a
    if (a.kind === 'text') return { ...a, ...patch }
    if (a.kind === 'image') {
      return {
        ...a,
        ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
      }
    }
    return {
      ...a,
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
    }
  })
}
