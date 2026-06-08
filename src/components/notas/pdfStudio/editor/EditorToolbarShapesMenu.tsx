import { ChevronDownIcon } from '../../../Icons'
import { OverflowMenu } from '../../../OverflowMenu'
import type { Tool } from './editorStyle'
import {
  activeMenuItem,
  editorMenuLayer,
  menuTrigger,
  SHAPES,
} from './EditorToolbarPrimitives'

export function EditorToolbarShapesMenu({
  tool,
  onToolChange,
}: {
  tool: Tool
  onToolChange: (tool: Tool) => void
}) {
  const activeShape = SHAPES.find((shape) => shape.key === tool)

  return (
    <OverflowMenu
      label="Formas"
      width="w-44"
      menuLayerClassName={editorMenuLayer}
      triggerClassName={menuTrigger}
      triggerContent={
        <>
          <span className="inline-flex w-4 justify-center" aria-hidden>
            {activeShape?.glyph ?? SHAPES[0]!.glyph}
          </span>
          <ChevronDownIcon size={12} className="text-ink-300" />
        </>
      }
    >
      {(close) => (
        <>
          {SHAPES.map((shape) => (
            <button
              key={shape.key}
              type="button"
              role="menuitemradio"
              aria-checked={tool === shape.key}
              aria-label={`Herramienta ${shape.label}`}
              onClick={() => {
                onToolChange(shape.key)
                close()
              }}
              className={activeMenuItem(tool === shape.key)}
            >
              <span className="inline-flex w-4 justify-center" aria-hidden>
                {shape.glyph}
              </span>
              <span>{shape.label}</span>
            </button>
          ))}
        </>
      )}
    </OverflowMenu>
  )
}
