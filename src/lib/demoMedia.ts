const DEMO_PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Cuaderno abierto">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8f3e7"/>
      <stop offset="1" stop-color="#ded3bd"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="#2f3c35"/>
  <rect x="170" y="105" width="860" height="590" rx="22" fill="url(#paper)"/>
  <path d="M600 120v555" stroke="#b8aa8e" stroke-width="5"/>
  <g stroke="#81745e" stroke-width="5" stroke-linecap="round" opacity=".72">
    <path d="M250 210h260M250 275h210M250 340h245M250 405h185"/>
    <path d="M690 220h260M690 285h210M690 350h245M690 415h170"/>
  </g>
  <circle cx="905" cy="550" r="58" fill="#b9824b" opacity=".82"/>
</svg>`

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

export function demoMediaResponse(url: string): Response | null {
  const path = url.split('?')[0] ?? url
  if (path === '/api/momentos-file/demo/cuaderno.svg') {
    return new Response(DEMO_PHOTO_SVG, {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  if (path === '/api/momentos-file/demo/nota-voz.wav') {
    return new Response(silentWav().buffer as ArrayBuffer, {
      headers: { 'Content-Type': 'audio/wav' },
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
  // se vean en vez de quedar rotos.
  if (path.startsWith('/api/recortes-image/')) {
    return new Response(DEMO_PHOTO_SVG, {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  return null
}
