import { AITaskSettings } from '../AITaskSettings'
import { PanelHeader } from './_shared'

export function AIPanel() {
  return (
    <section>
      <PanelHeader
        title="IA por tarea"
        hint="Cada flujo de IA puede usar un modelo distinto. Si no eliges nada, usa el default de Netlify."
      />
      <AITaskSettings />
    </section>
  )
}
