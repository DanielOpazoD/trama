export type PdfCommandScope = 'pages' | 'annotations' | 'history' | 'view'

export type PdfShortcutKeys = {
  mac: string[]
  windows: string[]
}

export type PdfCommand = {
  id: PdfCommandId
  scope: PdfCommandScope
  label: string
  keys: PdfShortcutKeys
  showInHelp: boolean
}

export type PdfShortcutGroup = {
  title: string
  shortcuts: { keys: string[]; label: string }[]
}

export type PdfCommandId =
  | 'undo'
  | 'redo'
  | 'selectAllPages'
  | 'copyPageSelection'
  | 'cutPageSelection'
  | 'pastePageSelection'
  | 'deletePageSelection'
  | 'copyAnnotation'
  | 'cutAnnotation'
  | 'pasteAnnotation'
  | 'duplicateAnnotation'
  | 'deleteAnnotation'
  | 'moveAnnotationFine'
  | 'moveAnnotationLarge'

const PDF_COMMANDS: PdfCommand[] = [
  {
    id: 'undo',
    scope: 'history',
    label: 'Deshacer',
    keys: { mac: ['⌘', 'Z'], windows: ['Ctrl', 'Z'] },
    showInHelp: false,
  },
  {
    id: 'redo',
    scope: 'history',
    label: 'Rehacer',
    keys: { mac: ['⌘', 'Shift', 'Z'], windows: ['Ctrl', 'Shift', 'Z'] },
    showInHelp: false,
  },
  {
    id: 'selectAllPages',
    scope: 'pages',
    label: 'Marcar todas las páginas',
    keys: { mac: ['⌘', 'A'], windows: ['Ctrl', 'A'] },
    showInHelp: true,
  },
  {
    id: 'copyPageSelection',
    scope: 'pages',
    label: 'Copiar páginas marcadas',
    keys: { mac: ['⌘', 'C'], windows: ['Ctrl', 'C'] },
    showInHelp: true,
  },
  {
    id: 'cutPageSelection',
    scope: 'pages',
    label: 'Cortar páginas marcadas',
    keys: { mac: ['⌘', 'X'], windows: ['Ctrl', 'X'] },
    showInHelp: true,
  },
  {
    id: 'pastePageSelection',
    scope: 'pages',
    label: 'Pegar páginas copiadas',
    keys: { mac: ['⌘', 'V'], windows: ['Ctrl', 'V'] },
    showInHelp: true,
  },
  {
    id: 'deletePageSelection',
    scope: 'pages',
    label: 'Eliminar páginas marcadas',
    keys: { mac: ['Supr'], windows: ['Supr'] },
    showInHelp: true,
  },
  {
    id: 'copyAnnotation',
    scope: 'annotations',
    label: 'Copiar cuadro o imagen seleccionada',
    keys: { mac: ['⌘', 'C'], windows: ['Ctrl', 'C'] },
    showInHelp: true,
  },
  {
    id: 'cutAnnotation',
    scope: 'annotations',
    label: 'Cortar cuadro o imagen seleccionada',
    keys: { mac: ['⌘', 'X'], windows: ['Ctrl', 'X'] },
    showInHelp: true,
  },
  {
    id: 'pasteAnnotation',
    scope: 'annotations',
    label: 'Pegar cuadro o imagen copiada',
    keys: { mac: ['⌘', 'V'], windows: ['Ctrl', 'V'] },
    showInHelp: true,
  },
  {
    id: 'duplicateAnnotation',
    scope: 'annotations',
    label: 'Duplicar',
    keys: { mac: ['⌘', 'D'], windows: ['Ctrl', 'D'] },
    showInHelp: true,
  },
  {
    id: 'deleteAnnotation',
    scope: 'annotations',
    label: 'Eliminar anotación seleccionada',
    keys: { mac: ['Supr'], windows: ['Supr'] },
    showInHelp: true,
  },
  {
    id: 'moveAnnotationFine',
    scope: 'annotations',
    label: 'Mover anotación con precisión',
    keys: { mac: ['↑', '↓', '←', '→'], windows: ['↑', '↓', '←', '→'] },
    showInHelp: true,
  },
  {
    id: 'moveAnnotationLarge',
    scope: 'annotations',
    label: 'Mover anotación con paso amplio',
    keys: {
      mac: ['Shift', '↑', '↓', '←', '→'],
      windows: ['Shift', '↑', '↓', '←', '→'],
    },
    showInHelp: true,
  },
]

const COMMAND_BY_ID = new Map(PDF_COMMANDS.map((command) => [command.id, command]))

export function isPdfCommandId(value: string): value is PdfCommandId {
  return COMMAND_BY_ID.has(value as PdfCommandId)
}

export function getPdfCommand(id: PdfCommandId): PdfCommand {
  const command = COMMAND_BY_ID.get(id)
  if (!command) throw new Error(`Unknown PDF command: ${id}`)
  return command
}

export function pdfShortcutKeys(id: PdfCommandId, isMac: boolean): string[] {
  const keys = getPdfCommand(id).keys
  return isMac ? keys.mac : keys.windows
}

export function pdfCommandTooltip(id: PdfCommandId, isMac: boolean): string {
  const command = getPdfCommand(id)
  return `${command.label} (${pdfShortcutKeys(id, isMac).join(' ')})`
}

export function getPdfShortcutGroups(isMac: boolean): PdfShortcutGroup[] {
  const shortcutsFor = (scope: PdfCommandScope) =>
    PDF_COMMANDS.filter((command) => command.scope === scope && command.showInHelp).map(
      (command) => ({
        keys: isMac ? command.keys.mac : command.keys.windows,
        label: command.label,
      }),
    )

  return [
    { title: 'Imprenta · páginas', shortcuts: shortcutsFor('pages') },
    { title: 'Imprenta · edición', shortcuts: shortcutsFor('annotations') },
  ]
}
