import { ChevronDownIcon } from '../../../Icons'
import { activeMenuItem, editorMenuLayer, menuTrigger } from './EditorToolbarPrimitives'
import { OverflowMenu } from '../../../OverflowMenu'

/** Menú "Campos": detectar campos del PDF y sugerir casilleros. Crear casillero
 *  vive SOLO en el botón primario de la barra (antes estaba duplicado acá). */
export function EditorToolbarFormMenu({
  onInspectForms,
  onSuggestFormFields,
}: {
  onInspectForms?: () => void
  onSuggestFormFields?: () => void
}) {
  if (!onInspectForms && !onSuggestFormFields) return null

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
        </>
      )}
    </OverflowMenu>
  )
}
