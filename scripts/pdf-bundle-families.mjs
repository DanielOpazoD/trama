import {
  PDF_ENTRYPOINT_INVENTORY,
  PDF_PAYLOAD_BASES,
} from './pdf-entrypoint-inventory.mjs'

export const PDF_BUNDLE_FAMILIES = PDF_ENTRYPOINT_INVENTORY.map((entry) => ({
  name: entry.label,
  budget: entry.budget,
  bases: entry.bases,
}))

export const PDF_AGGREGATE_BUDGETS = [
  {
    name: 'PDF lazy payload total',
    // Suma gzip de los chunks/worker PDF lazy. No mide initial path; sí evita
    // que PDF Studio/Imprenta crezcan por duplicación silenciosa entre workers.
    budget: 2050,
    bases: PDF_PAYLOAD_BASES,
  },
  ...PDF_BUNDLE_FAMILIES,
]
