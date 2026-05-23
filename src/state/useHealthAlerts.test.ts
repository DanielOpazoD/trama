import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acknowledgeHealthAlerts } from './useHealthAlerts'

/**
 * Tests del lado puro de useHealthAlerts — el almacenamiento + el evento
 * custom. El hook completo requiere setup de QueryClient + jsdom + waitFor;
 * lo dejamos para un test de UI (Settings.test si llegara) donde tiene
 * más sentido.
 *
 * Estos tests garantizan el contrato:
 *   - acknowledgeHealthAlerts persiste codes en localStorage
 *   - reemplaza, no acumula (si una alert se va y vuelve, debe notificar)
 *   - dispara el custom event que despierta a los hooks en la misma tab
 */

const ACK_KEY = 'trama:health-alerts-acknowledged'

describe('acknowledgeHealthAlerts', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it('persiste los códigos en localStorage', () => {
    acknowledgeHealthAlerts(['errors-high-24h', 'budget-near-cap'])
    const raw = window.localStorage.getItem(ACK_KEY)
    expect(raw).toBeTruthy()
    const stored = JSON.parse(raw!)
    expect(stored).toEqual(['errors-high-24h', 'budget-near-cap'])
  })

  it('reemplaza el set anterior (no hace union)', () => {
    // Esto es importante: si una alerta dejó de estar activa, queremos
    // que vuelva a notificar cuando reaparezca. Si acumuláramos códigos,
    // se quedaría silenciada para siempre.
    acknowledgeHealthAlerts(['errors-high-24h'])
    acknowledgeHealthAlerts(['budget-near-cap'])
    const stored = JSON.parse(window.localStorage.getItem(ACK_KEY)!)
    expect(stored).toEqual(['budget-near-cap'])
    expect(stored).not.toContain('errors-high-24h')
  })

  it('dispara el evento custom para que los hooks re-rendeen', () => {
    let fired = 0
    function handler() {
      fired += 1
    }
    window.addEventListener('trama:health-ack', handler)
    try {
      acknowledgeHealthAlerts(['errors-high-24h'])
      acknowledgeHealthAlerts([])
      expect(fired).toBe(2)
    } finally {
      window.removeEventListener('trama:health-ack', handler)
    }
  })

  it('manejar array vacío (limpiar acknowledgments)', () => {
    acknowledgeHealthAlerts(['errors-high-24h'])
    acknowledgeHealthAlerts([])
    const stored = JSON.parse(window.localStorage.getItem(ACK_KEY)!)
    expect(stored).toEqual([])
  })
})
