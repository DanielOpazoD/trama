/**
 * Monta el `<ImageEditorModal>` en un root desprendido (fuera del árbol React de
 * la app) y resuelve una promesa con el resultado. Browser-only (createRoot +
 * DOM) → excluido de coverage. Se importa de forma perezosa desde index.ts.
 */
import { createRoot } from 'react-dom/client'
import type { EditImageOptions } from './types'
import { ImageEditorModal } from '../../components/imageEditor/ImageEditorModal'

export function mountImageEditor(
  file: File,
  options: EditImageOptions,
): Promise<File | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let settled = false
    function finish(result: File | null) {
      if (settled) return
      settled = true
      // Desmontar fuera del ciclo de render actual.
      setTimeout(() => {
        root.unmount()
        container.remove()
      }, 0)
      resolve(result)
    }
    root.render(<ImageEditorModal file={file} options={options} onResolve={finish} />)
  })
}
