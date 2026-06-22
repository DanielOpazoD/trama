// Paletas de la foto demo: la 0 es la histórica (no cambiar — un test fija su
// aria-label). Las otras dan variedad para que un recorte-evento de varias fotos
// no muestre tres imágenes idénticas en modo prueba.
const DEMO_PHOTO_PALETTES = [
  { bg: '#2f3c35', accent: '#b9824b' }, // verde + terracota (histórica)
  { bg: '#33303c', accent: '#6f8faa' }, // gris violáceo + azul
  { bg: '#3a3329', accent: '#8d9a6a' }, // tierra + sage
] as const

function demoPhotoSvg(variant = 0): string {
  const { bg, accent } = DEMO_PHOTO_PALETTES[variant % DEMO_PHOTO_PALETTES.length]!
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Cuaderno abierto">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8f3e7"/>
      <stop offset="1" stop-color="#ded3bd"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="${bg}"/>
  <rect x="170" y="105" width="860" height="590" rx="22" fill="url(#paper)"/>
  <path d="M600 120v555" stroke="#b8aa8e" stroke-width="5"/>
  <g stroke="#81745e" stroke-width="5" stroke-linecap="round" opacity=".72">
    <path d="M250 210h260M250 275h210M250 340h245M250 405h185"/>
    <path d="M690 220h260M690 285h210M690 350h245M690 415h170"/>
  </g>
  <circle cx="905" cy="550" r="58" fill="${accent}" opacity=".82"/>
</svg>`
}

const DEMO_PHOTO_SVG = demoPhotoSvg(0)

function silentWav(durationSeconds = 1): Uint8Array {
  const sampleRate = 8000
  const samples = sampleRate * durationSeconds
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples * 2, true)
  return bytes
}

/**
 * PDF mínimo válido (una página A4 con un título), construido a mano. pdf.js lo
 * abre y renderiza, así el visor de la Biblioteca funciona en modo prueba en vez
 * de errorear. No usamos pdf-lib acá a propósito: este módulo es liviano y debe
 * quedar fuera de la frontera lazy del runtime de PDF.
 */
function demoPdfBytes(): Uint8Array {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 84 >>\nstream\nBT /F1 24 Tf 64 760 Td ' +
      '(Documento de prueba — Trama) Tj ET\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const obj of objects) {
    offsets.push(body.length)
    body += obj
  }
  const xrefStart = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  body +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF`
  const bytes = new Uint8Array(body.length)
  for (let i = 0; i < body.length; i += 1) bytes[i] = body.charCodeAt(i)
  return bytes
}

/** Texto de muestra para el visor de texto/markdown en modo prueba. */
const DEMO_TEXT_SAMPLE = `# Borrador de ensayo

La biblioteca de Babel contiene todos los libros posibles. Este es un texto
de prueba para ver el visor de texto de la Biblioteca en modo prueba.

- Una lista
- de ejemplo
- para hojear

"Siempre imaginé que el Paraíso sería algún tipo de biblioteca." — J. L. Borges
`

/** JSON de muestra para el visor de texto en modo prueba (se pretty-printea). */
const DEMO_JSON_SAMPLE = JSON.stringify(
  {
    export: 'trama',
    version: 1,
    entidades: 42,
    relaciones: 87,
    generado: '2026-06-21T09:00:00.000Z',
  },
  null,
  2,
)

export function demoMediaResponse(url: string): Response | null {
  const path = url.split('?')[0] ?? url
  // Anexos demo no-imagen (PR-A): el visor baja el blob por su extensión. Servimos
  // un PDF mínimo válido para `.pdf` y texto/JSON para `.md`/`.txt`/`.json`/…, así
  // los visores de PDF y de texto renderizan en modo prueba en vez de errorear.
  if (path.startsWith('/api/notas-attachments-file/')) {
    if (/\.pdf$/i.test(path)) {
      return new Response(demoPdfBytes().buffer as ArrayBuffer, {
        headers: { 'Content-Type': 'application/pdf' },
      })
    }
    if (/\.json$/i.test(path)) {
      return new Response(DEMO_JSON_SAMPLE, {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (/\.(md|markdown|txt|csv|log)$/i.test(path)) {
      return new Response(DEMO_TEXT_SAMPLE, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
  }
  // Fotos de Momentos en modo prueba: como los recortes/anexos, cualquier key
  // sirve un placeholder para que las miniaturas y el visor se vean (en vez de
  // quedar rotos). Si la key parece audio (nota de voz), un WAV silencioso; si
  // termina en `-N.svg`, variamos la paleta para que las fotos de un mismo
  // evento no se vean idénticas.
  if (path.startsWith('/api/momentos-file/')) {
    if (/\.(wav|ogg|oga|mp3|m4a|aac|webm|flac)$/i.test(path)) {
      return new Response(silentWav().buffer as ArrayBuffer, {
        headers: { 'Content-Type': 'audio/wav' },
      })
    }
    const variant = Number(/-(\d)\.svg$/.exec(path)?.[1] ?? 1) - 1
    return new Response(demoPhotoSvg(Math.max(0, variant)), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  // Anexos de Notas/Tareas en modo prueba: cualquier key sirve un placeholder.
  // Si la key parece audio (nota de voz), servimos un WAV silencioso para que el
  // reproductor funcione; si no, el SVG de foto.
  if (path.startsWith('/api/notas-attachments-file/')) {
    if (/\.(wav|ogg|oga|mp3|m4a|aac|webm|flac)$/i.test(path)) {
      return new Response(silentWav().buffer as ArrayBuffer, {
        headers: { 'Content-Type': 'audio/wav' },
      })
    }
    return new Response(DEMO_PHOTO_SVG, {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  // Imágenes propias de las capturas (recortes): igual que los anexos, en modo
  // prueba cualquier key sirve el placeholder para que la miniatura y el visor
  // se vean en vez de quedar rotos. Si la key termina en `-N.svg` (las fotos de
  // un recorte-evento demo), variamos la paleta para que no se vean idénticas.
  if (path.startsWith('/api/recortes-image/')) {
    const variant = Number(/-(\d)\.svg$/.exec(path)?.[1] ?? 1) - 1
    return new Response(demoPhotoSvg(Math.max(0, variant)), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  return null
}
