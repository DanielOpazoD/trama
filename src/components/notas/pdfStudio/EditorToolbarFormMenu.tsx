import type { PdfFormFieldKind } from '../../../lib/pdfStudio/model'
import { ChevronDownIcon } from '../../Icons'
import { activeMenuItem, editorMenuLayer, menuTrigger } from './EditorToolbarPrimitives'
import { OverflowMenu } from '../../OverflowMenu'

const FORM_FIELDS: {
  key: PdfFormFieldKind
  label: string
  glyph: string
}[] = [
  { key: 'text', label: 'Texto', glyph: 'T' },
  { key: 'date', label: 'Fecha', glyph: 'D' },
  { key: 'checkbox', label: 'Checkbox', glyph: '✓' },
  { key: 'radio', label: 'Radio', glyph: '○' },
  { key: 'signature', label: 'Firma', glyph: '✎' },
]

export function EditorToolbarFormMenu({
  onAddFormField,
  onInspectForms,
}: {
  onAddFormField?: (kind: PdfFormFieldKind) => void
  onInspectForms?: () => void
}) {
  if (!onAddFormField && !onInspectForms) return null

  return (
    <OverflowMenu
      label="Campos"
      width="w-44"
      menuLayerClassName={editorMenuLayer}
      triggerClassName={menuTrigger}
      triggerContent={
        <>
          <span className="text-caption font-semibold">□</span>
          <ChevronDownIcon size={12} className="text-ink-300" />
        </>
      }
    >
      {(close) => (
        <>
          {onInspectForms && (
            <button
              type="button"
              role="menuitem"
              aria-label="Detectar campos del PDF"
              onClick={() => {
                onInspectForms()
                close()
              }}
              className={activeMenuItem(false)}
            >
              <span className="inline-flex w-4 justify-center" aria-hidden>
                ⌖
              </span>
              <span>Detectar</span>
            </button>
          )}
          {onAddFormField &&
            FORM_FIELDS.map((field) => (
              <button
                key={field.key}
                type="button"
                role="menuitem"
                aria-label={`Crear campo ${field.label}`}
                onClick={() => {
                  onAddFormField(field.key)
                  close()
                }}
                className={activeMenuItem(false)}
              >
                <span className="inline-flex w-4 justify-center" aria-hidden>
                  {field.glyph}
                </span>
                <span>{field.label}</span>
              </button>
            ))}
        </>
      )}
    </OverflowMenu>
  )
}
