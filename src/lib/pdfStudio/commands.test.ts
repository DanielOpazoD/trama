import { describe, expect, it } from 'vitest'
import {
  getPdfCommand,
  getPdfShortcutGroups,
  isPdfCommandId,
  pdfCommandTooltip,
} from './commands'

describe('pdfStudio commands', () => {
  it('expone comandos centrales para edición de páginas y anotaciones', () => {
    expect(getPdfCommand('copyPageSelection').scope).toBe('pages')
    expect(getPdfCommand('copyAnnotation').scope).toBe('annotations')
    expect(getPdfCommand('pasteAnnotation').keys.mac).toEqual(['⌘', 'V'])
    expect(getPdfCommand('deleteAnnotation').keys.windows).toEqual(['Supr'])
    expect(isPdfCommandId('duplicateAnnotation')).toBe(true)
    expect(isPdfCommandId('unknown')).toBe(false)
  })

  it('genera tooltips consistentes con el sistema operativo', () => {
    expect(pdfCommandTooltip('undo', true)).toBe('Deshacer (⌘ Z)')
    expect(pdfCommandTooltip('undo', false)).toBe('Deshacer (Ctrl Z)')
    expect(pdfCommandTooltip('duplicateAnnotation', true)).toBe('Duplicar (⌘ D)')
  })

  it('agrupa atajos de Imprenta para el modal global', () => {
    const groups = getPdfShortcutGroups(true)
    expect(groups.map((g) => g.title)).toEqual([
      'Imprenta · páginas',
      'Imprenta · edición',
    ])
    expect(groups[0]!.shortcuts).toEqual(
      expect.arrayContaining([
        { keys: ['⌘', 'C'], label: 'Copiar páginas marcadas' },
        { keys: ['⌘', 'V'], label: 'Pegar páginas copiadas' },
      ]),
    )
    expect(groups[1]!.shortcuts).toEqual(
      expect.arrayContaining([
        { keys: ['⌘', 'C'], label: 'Copiar cuadro o imagen seleccionada' },
        { keys: ['Supr'], label: 'Eliminar anotación seleccionada' },
        { keys: ['Shift', '↑', '↓', '←', '→'], label: 'Mover anotación con paso amplio' },
      ]),
    )
  })
})
