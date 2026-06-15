import {
  deletePages,
  duplicatePages,
  movePage,
  movePageByDelta,
  movePages,
  rotatePages,
} from './modelPages'
import { subsetDoc } from './modelDocument'
import type { PdfDoc } from './modelTypes'

export type PdfPageCommand =
  | { type: 'deletePages'; indices: number[] }
  | { type: 'duplicatePages'; indices: number[] }
  | { type: 'rotatePages'; indices: number[]; delta: number }
  | { type: 'movePage'; from: number; to: number }
  | { type: 'movePageByDelta'; index: number; delta: -1 | 1 }
  | { type: 'movePages'; indices: number[]; to: number }
  | { type: 'subsetDoc'; indices: number[] }

export function reducePdfPageCommand(doc: PdfDoc, command: PdfPageCommand): PdfDoc {
  switch (command.type) {
    case 'deletePages':
      return deletePages(doc, command.indices)
    case 'duplicatePages':
      return duplicatePages(doc, command.indices)
    case 'rotatePages':
      return rotatePages(doc, command.indices, command.delta)
    case 'movePage':
      return movePage(doc, command.from, command.to)
    case 'movePageByDelta':
      return movePageByDelta(doc, command.index, command.delta)
    case 'movePages':
      return movePages(doc, command.indices, command.to)
    case 'subsetDoc':
      return subsetDoc(doc, command.indices)
  }
}
