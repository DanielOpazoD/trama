/**
 * Genera una infografía SVG (cheat-sheet) de los comandos de Trama por
 * WhatsApp, con dos columnas: "lo que escribes" → "lo que Trama responde".
 * Texto nítido garantizado (vector), estética editorial premium de Trama.
 *
 *   node scripts/gen-whatsapp-cheatsheet.mjs
 */
import { writeFileSync } from 'node:fs'

const C = {
  paper: '#FBF8F1',
  card: '#FFFFFF',
  border: '#ECE6DA',
  ink: '#2B2B2B',
  inkSoft: '#7A7367',
  prussian: '#1F3A5F',
  gold: '#B8893A',
  chip: '#F4EFE4',
}

const W = 1040
const M = 64 // margen lateral
const colGap = 48
const leftX = M
const colW = (W - M * 2 - colGap) / 2 // ancho por columna
const rightX = leftX + colW + colGap

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const sections = [
  {
    title: 'CAPTURAR',
    note: 'instantáneo y gratis',
    rows: [
      ['nota: <texto>', '📝', 'Nota guardada en Trama'],
      ['cita: <frase> — <autor>', '❝', 'Cita guardada con su autor'],
      ['entidad: <nombre> (tipo)', '🔭', 'Se añade a tu grafo'],
      ['momento: <qué pasó>', '🕰️', 'Va a tu línea de tiempo'],
      ['(texto libre)', '✨', 'La IA lo clasifica por ti'],
    ],
  },
  {
    title: 'FOTOS',
    note: null,
    rows: [
      ['una imagen', '📷', 'Se guarda en Recortes'],
      ['nota: / cita: + foto', '🔎', 'Lee el texto (OCR)'],
    ],
  },
  {
    title: 'PREGUNTAR',
    note: 'consulta tu Trama',
    rows: [
      ['buscar: <tema>', '🔎', 'Respuesta desde lo tuyo'],
      ['? <pregunta>', '🔎', 'Respuesta desde lo tuyo'],
    ],
  },
  {
    title: 'AJUSTAR LO ÚLTIMO',
    note: 'responde después de guardar',
    rows: [
      ['título <texto>', '🏷️', 'Lo nombra'],
      ['etiqueta <palabras>', '🏷️', 'Le agrega etiquetas'],
      ['nota · momento · entidad', '🔄', 'Lo reclasifica'],
      ['deshacer', '↩️', 'Revierte lo último'],
    ],
  },
  {
    title: 'CUENTA',
    note: null,
    rows: [
      ['vincular <código>', '🔗', 'Conecta tu número'],
      ['estado', '📊', 'Tu resumen'],
    ],
  },
]

// Layout vertical.
const padTop = 188
const colLabelsH = 46
const secHeaderH = 50
const rowH = 58
let y = padTop + colLabelsH
const blocks = []
for (const s of sections) {
  blocks.push({ type: 'section', y, s })
  y += secHeaderH
  for (const r of s.rows) {
    blocks.push({ type: 'row', y, r })
    y += rowH
  }
  y += 14 // aire entre secciones
}
const footerY = y + 18
const H = footerY + 66

const monoFont = "'SFMono-Regular','Menlo','Consolas',monospace"
const serif = "'Iowan Old Style','Palatino Linotype','Georgia',serif"
const sans = "'Inter','Helvetica Neue','Arial',sans-serif"

const parts = []
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${sans}">`,
)
parts.push(`<defs>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#1F3A5F" flood-opacity="0.08"/>
  </filter>
</defs>`)

// Fondo papel.
parts.push(`<rect width="${W}" height="${H}" fill="${C.paper}"/>`)
// Banda de acento superior.
parts.push(`<rect x="0" y="0" width="${W}" height="8" fill="${C.prussian}"/>`)

// Encabezado.
parts.push(
  `<text x="${M}" y="78" font-family="${serif}" font-size="46" fill="${C.ink}" font-weight="600">Trama</text>`,
)
parts.push(
  `<text x="${M}" y="112" font-family="${sans}" font-size="20" fill="${C.gold}" letter-spacing="3">GUÍA DE COMANDOS · WHATSAPP</text>`,
)
parts.push(
  `<text x="${M}" y="150" font-family="${sans}" font-size="17" fill="${C.inkSoft}">Tu segundo cerebro, ahora desde el bolsillo. No importan mayúsculas ni tildes.</text>`,
)
// Línea divisoria.
parts.push(
  `<line x1="${M}" y1="170" x2="${W - M}" y2="170" stroke="${C.border}" stroke-width="2"/>`,
)

// Cabeceras de columna.
const clY = padTop + 4
parts.push(
  `<text x="${leftX + 18}" y="${clY}" font-family="${sans}" font-size="15" fill="${C.prussian}" letter-spacing="2" font-weight="700">LO QUE ESCRIBES</text>`,
)
parts.push(
  `<text x="${rightX + 18}" y="${clY}" font-family="${sans}" font-size="15" fill="${C.gold}" letter-spacing="2" font-weight="700">LO QUE TRAMA RESPONDE</text>`,
)

for (const b of blocks) {
  if (b.type === 'section') {
    parts.push(
      `<text x="${M}" y="${b.y + 30}" font-family="${sans}" font-size="16" fill="${C.ink}" letter-spacing="2.5" font-weight="700">${esc(b.s.title)}</text>`,
    )
    if (b.s.note) {
      parts.push(
        `<text x="${M + b.s.title.length * 11 + 22}" y="${b.y + 30}" font-family="${serif}" font-size="15" fill="${C.inkSoft}" font-style="italic">${esc(b.s.note)}</text>`,
      )
    }
    continue
  }
  const [cmd, icon, resp] = b.r
  const ry = b.y
  const h = rowH - 12
  // Tarjeta "escribes" (mono sobre chip).
  parts.push(
    `<rect x="${leftX}" y="${ry}" width="${colW}" height="${h}" rx="12" fill="${C.chip}" stroke="${C.border}" stroke-width="1.5"/>`,
  )
  parts.push(
    `<text x="${leftX + 18}" y="${ry + h / 2 + 7}" font-family="${monoFont}" font-size="21" fill="${C.ink}">${esc(cmd)}</text>`,
  )
  // Flecha.
  const ax = leftX + colW + colGap / 2
  parts.push(
    `<text x="${ax}" y="${ry + h / 2 + 8}" text-anchor="middle" font-size="24" fill="${C.prussian}">→</text>`,
  )
  // Tarjeta "responde".
  parts.push(
    `<rect x="${rightX}" y="${ry}" width="${colW}" height="${h}" rx="12" fill="${C.card}" stroke="${C.border}" stroke-width="1.5" filter="url(#soft)"/>`,
  )
  parts.push(
    `<text x="${rightX + 18}" y="${ry + h / 2 + 9}" font-size="24">${esc(icon)}</text>`,
  )
  parts.push(
    `<text x="${rightX + 56}" y="${ry + h / 2 + 7}" font-family="${sans}" font-size="20" fill="${C.ink}">${esc(resp)}</text>`,
  )
}

// Pie.
parts.push(
  `<line x1="${M}" y1="${footerY - 6}" x2="${W - M}" y2="${footerY - 6}" stroke="${C.border}" stroke-width="2"/>`,
)
parts.push(
  `<text x="${M}" y="${footerY + 28}" font-family="${sans}" font-size="16" fill="${C.inkSoft}">Conecta tu número en Trama → Configuración → WhatsApp y envía:  <tspan font-family="${monoFont}" fill="${C.ink}">vincular &lt;código&gt;</tspan></text>`,
)
parts.push(
  `<text x="${M}" y="${footerY + 52}" font-family="${sans}" font-size="14" fill="${C.inkSoft}">También funciona con «/» (ej. /nota …). El prefijo es instantáneo; el texto libre usa IA.</text>`,
)

parts.push(`</svg>`)

writeFileSync('docs/whatsapp-comandos.svg', parts.join('\n'))
console.log('OK → docs/whatsapp-comandos.svg', W + 'x' + H)
