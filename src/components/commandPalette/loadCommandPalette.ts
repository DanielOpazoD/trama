import { singleFlightImport } from '../../lib/singleFlightImport'

/** La paleta se baja al abrirla por primera vez; precargar y montar comparten la importación. */
export const loadCommandPalette = singleFlightImport(() =>
  import('../CommandPalette').then((m) => ({ default: m.CommandPalette })),
)
