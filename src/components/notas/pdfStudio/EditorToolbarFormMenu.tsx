import type { PdfFormFieldKind } from '../../../lib/pdfStudio/model/model'
import { ChevronDownIcon } from '../../Icons'
import { activeMenuItem, editorMenuLayer, menuTrigger } from './EditorToolbarPrimitives'
import { OverflowMenu } from '../../OverflowMenu'

const FORM_FIELDS: {
  key: PdfFormFieldKind
  label: string
  ariaLabel: string
  glyph: string
}[] = [
  {
    key: 'text',
    label: 'Casillero de texto',
    ariaLabel: 'Crear casillero de texto',
    glyph: 'T',
  },
]

export function EditorToolbarFormMenu({
  onAddFormField,
  onInspectForms,
  onSuggestFormFields,
}: {
  onAddFormField?: (kind: PdfFormFieldKind) => void
  onInspectForms?: () => void
  onSuggestFormFields?: () => void
}) {
  if (!onAddFormField && !onInspectForms && !onSuggestFormFields) return null

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
          {onSuggestFormFields && (
            <button
              type="button"
              role="menuitem"
              aria-label="Sugerir casilleros vacíos"
              onClick={() => {
                onSuggestFormFields()
                close()
              }}
              className={activeMenuItem(false)}
            >
              <span className="inline-flex w-4 justify-center" aria-hidden>
                ✦
              </span>
              <span>Sugerir</span>
            </button>
          )}
          {onAddFormField &&
            FORM_FIELDS.map((field) => (
              <button
                key={field.key}
                type="button"
                role="menuitem"
                aria-label={field.ariaLabel}
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
