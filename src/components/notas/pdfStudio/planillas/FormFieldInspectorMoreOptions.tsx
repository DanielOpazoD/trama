import { useState } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { focusRing } from '../editor/EditorToolbarPrimitives'
import type { FormFieldVisualPatch } from './pdfFormFieldStyle'
import type { FormFieldPresetKey } from './pdfFormFieldPresets'
import {
  InspectorAdvancedSection,
  InspectorColorPreview,
  InspectorDisclosure,
  InspectorPresetRow,
  InspectorSwatchRow,
} from './FormFieldInspectorSections'
import type { InspectorFlagsPatch } from './formFieldInspectorModel'

type InspectorSection = 'color' | 'bg' | 'border' | 'presets' | 'advanced'

/**
 * Cola del inspector: colores, presets y opciones avanzadas son de uso poco
 * frecuente, así que viven detrás de un «Más opciones» sutil — el panel
 * muestra por defecto sólo lo esencial (variable, valor, tamaño, alineación).
 */
export function FormFieldInspectorMoreOptions({
  active,
  hasTextControls,
  multi,
  onApplyPreset,
  onApplyVisual,
  onPatchSelection,
  onRememberStyle,
}: {
  active: PdfFormFieldDraft
  hasTextControls: boolean
  multi: boolean
  onApplyPreset: (key: FormFieldPresetKey) => void
  onApplyVisual: (patch: FormFieldVisualPatch) => void
  onPatchSelection: (patch: InspectorFlagsPatch) => void
  onRememberStyle?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [openSection, setOpenSection] = useState<InspectorSection | null>(null)
  const toggle = (section: InspectorSection) =>
    setOpenSection((current) => (current === section ? null : section))

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`mt-2 flex w-full items-center justify-center gap-1 rounded-md border-t border-ink-100/70 py-1.5 text-micro font-medium text-ink-400 transition-colors hover:text-ink-600 ${focusRing}`}
      >
        {open ? 'Menos opciones' : 'Más opciones'}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="animate-pdf-panel-in">
          {hasTextControls ? (
            <InspectorDisclosure
              label="Color de texto"
              open={openSection === 'color'}
              preview={<InspectorColorPreview color={active.color} />}
              onToggle={() => toggle('color')}
            >
              <InspectorSwatchRow
                label="Color de texto"
                activeColor={active.color}
                clearLabel="Color de texto por defecto"
                onClear={() => onApplyVisual({ color: null })}
                onSelect={(hex) => onApplyVisual({ color: hex })}
              />
            </InspectorDisclosure>
          ) : null}
          <InspectorDisclosure
            label="Fondo"
            open={openSection === 'bg'}
            preview={<InspectorColorPreview color={active.bgColor} />}
            onToggle={() => toggle('bg')}
          >
            <InspectorSwatchRow
              label="Fondo"
              activeColor={active.bgColor}
              clearLabel="Sin fondo"
              onClear={() => onApplyVisual({ bgColor: null })}
              onSelect={(hex) => onApplyVisual({ bgColor: hex })}
            />
          </InspectorDisclosure>
          <InspectorDisclosure
            label="Borde"
            open={openSection === 'border'}
            preview={<InspectorColorPreview color={active.borderColor} />}
            onToggle={() => toggle('border')}
          >
            <InspectorSwatchRow
              label="Borde"
              activeColor={active.borderColor}
              clearLabel="Sin borde"
              onClear={() => onApplyVisual({ borderColor: null })}
              onSelect={(hex) => onApplyVisual({ borderColor: hex })}
            />
          </InspectorDisclosure>
          {hasTextControls ? (
            <InspectorDisclosure
              label="Presets"
              hint="Estilos completos de un clic"
              open={openSection === 'presets'}
              onToggle={() => toggle('presets')}
            >
              <InspectorPresetRow onApplyPreset={onApplyPreset} />
            </InspectorDisclosure>
          ) : null}
          <InspectorDisclosure
            label="Avanzado"
            open={openSection === 'advanced'}
            onToggle={() => toggle('advanced')}
          >
            <InspectorAdvancedSection
              required={active.required ?? false}
              readOnly={active.readOnly ?? false}
              showRememberStyle={!multi && active.fieldKind === 'text'}
              autoFillToday={
                !multi && active.fieldKind === 'date' ? active.autoFill === 'today' : null
              }
              onPatchSelection={onPatchSelection}
              onRememberStyle={onRememberStyle}
            />
          </InspectorDisclosure>
        </div>
      ) : null}
    </>
  )
}
