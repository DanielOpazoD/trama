/**
 * U-4: prompt para la Crónica del mes.
 *
 * Una crónica es **prosa editorial, no análisis ni motivación**. La IA
 * juega el rol de cronista observando la trama del usuario y narrando
 * un mes en su archivo personal. 200-300 palabras, sin viñetas, sin
 * recomendaciones, sin "deberías".
 */

import type { LLMMessage } from './llm/types.js'

const MONTH_NAMES_ES = [
  '',
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export type CronicaEntity = {
  name: string
  type: string
  description: string | null
  year: number | null
  quoteCount: number
  relCount: number
  recentQuotes: Array<{ text: string; source: string | null }>
}

export function monthName(month: number): string {
  return MONTH_NAMES_ES[month] ?? ''
}

export function buildCronicaMessages(input: {
  year: number
  month: number
  entities: CronicaEntity[]
}): LLMMessage[] {
  const { year, month, entities } = input
  const mesNombre = monthName(month)

  const material = entities
    .map((e, idx) => {
      const cites = e.recentQuotes
        .slice(0, 3)
        .map(
          (q, qi) =>
            `  ${qi + 1}. "${q.text.replace(/"/g, '"').slice(0, 320)}"${
              q.source ? ` (${q.source})` : ''
            }`,
        )
        .join('\n')
      return `${idx + 1}. ${e.name}${e.year ? ` (${e.year})` : ''} — ${e.type}${
        e.description ? `. ${e.description.slice(0, 200)}` : ''
      }
   Actividad este mes: ${e.quoteCount} cita(s) añadida(s), ${e.relCount} relación/es nueva(s).${
     cites ? `\n${cites}` : ''
   }`
    })
    .join('\n\n')

  const system = `Sos un cronista personal. Tu rol es observar la trama de lecturas, citas y relaciones de un usuario y escribir una crónica editorial breve de un mes específico.

Reglas absolutas:
- Prosa fluida. Sin viñetas, sin listas, sin numeración.
- Entre 200 y 300 palabras. Si te quedás corto, profundizá; si te pasás, recortá.
- Tercera persona literaria. NO uses primera persona ("yo creo que…"). NO te dirijas al usuario en segunda persona ("deberías…"). La crónica observa.
- Tono editorial, ligeramente reflexivo. NO motivacional. NO didáctico. NO eufórico ("¡qué mes increíble!").
- Podés mencionar entidades específicas por su nombre tal como aparecen en el material.
- Se permite citar fragmentos cortos textuales (entre comillas) de las citas que te paso. No inventes citas que no estén en el material.
- NO uses metáforas grandiosas ("explorar el universo de la mente", "viaje al corazón de…"). Mantenete cerca de la materialidad del texto.
- NO recomendar acciones futuras ni cerrar con resolución didáctica.
- Idioma: español neutro literario.`

  const user = `Crónica del mes de ${mesNombre} de ${year}.

Material — entidades más tocadas durante el mes, ordenadas por actividad:

${material}

Escribí la crónica del mes (200-300 palabras, prosa continua):`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
