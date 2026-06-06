import {
  cloneAnnotation,
  translateAnnotation,
  type Annotation,
} from '../../../lib/pdfStudio/model'

export type AnnotationShortcutInput = {
  annotations: Annotation[]
  selectedId: string | null
  clipboard: Annotation | null
  key: string
  mod: boolean
  shift: boolean
}

export type AnnotationShortcutResult = {
  annotations: Annotation[]
  selectedId: string | null
  clipboard: Annotation | null
  handled: boolean
}

function pasteAnnotation(
  annotations: Annotation[],
  src: Annotation,
): { annotations: Annotation[]; selectedId: string } {
  const placed = translateAnnotation(cloneAnnotation(src), 0.03, 0.03)
  return {
    annotations: [...annotations, placed],
    selectedId: placed.id,
  }
}

export function reduceAnnotationShortcut({
  annotations,
  selectedId,
  clipboard,
  key,
  mod,
  shift,
}: AnnotationShortcutInput): AnnotationShortcutResult {
  const normalizedKey = key.toLowerCase()

  if (mod && normalizedKey === 'v') {
    if (!clipboard) return { annotations, selectedId, clipboard, handled: false }
    const pasted = pasteAnnotation(annotations, clipboard)
    return { ...pasted, clipboard, handled: true }
  }

  const current = selectedId
    ? (annotations.find((a) => a.id === selectedId) ?? null)
    : null
  if (!current) return { annotations, selectedId, clipboard, handled: false }

  if (mod && normalizedKey === 'c') {
    return { annotations, selectedId, clipboard: current, handled: true }
  }

  if (current.locked) {
    return { annotations, selectedId, clipboard, handled: false }
  }

  if (mod && normalizedKey === 'x') {
    return {
      annotations: annotations.filter((a) => a.id !== current.id),
      selectedId: null,
      clipboard: current,
      handled: true,
    }
  }

  if (mod && normalizedKey === 'd') {
    const pasted = pasteAnnotation(annotations, current)
    return { ...pasted, clipboard, handled: true }
  }

  if (key === 'Delete' || key === 'Backspace') {
    return {
      annotations: annotations.filter((a) => a.id !== current.id),
      selectedId: null,
      clipboard,
      handled: true,
    }
  }

  if (key.startsWith('Arrow')) {
    const step = shift ? 0.05 : 0.01
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    return {
      annotations: annotations.map((a) =>
        a.id === current.id ? translateAnnotation(a, dx, dy) : a,
      ),
      selectedId,
      clipboard,
      handled: true,
    }
  }

  return { annotations, selectedId, clipboard, handled: false }
}
