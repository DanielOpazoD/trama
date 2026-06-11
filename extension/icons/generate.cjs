/**
 * Genera los iconos de la extensión (16/48/128 PNG) sin dependencias:
 * dibuja en un buffer RGBA y lo codifica como PNG con zlib nativo. Idea
 * visual: teja de papel cream con esquina doblada (= recorte guardado) y
 * unas tijeras de tinta — coherente con el ScissorsIcon del módulo.
 *
 * Reproducible: `node extension/icons/generate.cjs`.
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// --- PNG mínimo (RGBA, color type 6) ---------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // filtro 0 por scanline
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Dibujo (con antialias por supersampling 4x) ---------------------------
function draw(size) {
  const SS = 4
  const S = size * SS
  const buf = new Float32Array(S * S * 4) // RGBA premult acumulado
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return
    const i = (y * S + x) * 4
    const ia = 1 - a
    buf[i] = r * a + buf[i] * ia
    buf[i + 1] = g * a + buf[i + 1] * ia
    buf[i + 2] = b * a + buf[i + 2] * ia
    buf[i + 3] = a + buf[i + 3] * ia
  }
  const inRoundedTile = (x, y) => {
    const pad = S * 0.06
    const r = S * 0.18
    const fold = S * 0.26
    if (x < pad || y < pad || x > S - pad || y > S - pad) return null
    // esquina doblada (triángulo arriba-derecha recortado)
    if (x > S - pad - fold && y < pad + fold) {
      const dx = x - (S - pad - fold)
      const dy = pad + fold - y
      if (dx + dy > fold) return null // fuera del papel
      if (dx + dy > fold - S * 0.02) return 'foldedge'
      return 'fold' // triángulo de sombra del pliegue
    }
    // esquinas redondeadas (las tres normales)
    const corners = [
      [pad + r, pad + r],
      [pad + r, S - pad - r],
      [S - pad - r, S - pad - r],
    ]
    for (const [cx, cy] of corners) {
      if (
        ((x < pad + r && cx === pad + r) || (x > S - pad - r && cx === S - pad - r)) &&
        ((y < pad + r && cy === pad + r) || (y > S - pad - r && cy === S - pad - r))
      ) {
        if (Math.hypot(x - cx, y - cy) > r) return null
      }
    }
    return 'paper'
  }
  const distSeg = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const l2 = dx * dx + dy * dy
    let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
  }
  // tijeras
  const cx = S * 0.4
  const cy = S * 0.62
  const rr = S * 0.085
  const gap = S * 0.22
  const lw = S * 0.05
  const tipx = S * 0.78
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tile = inRoundedTile(x + 0.5, y + 0.5)
      if (tile === 'paper' || tile === 'foldedge') px(x, y, 244, 239, 230, 1)
      else if (tile === 'fold') px(x, y, 216, 207, 189, 1)
      if (tile === null) continue
      // anillos de las tijeras (stroke)
      const ringDist = Math.min(
        Math.abs(Math.hypot(x - cx, y - (cy + gap * 0.5)) - rr),
        Math.abs(Math.hypot(x - cx, y - (cy - gap * 0.5)) - rr),
      )
      const bladeDist = Math.min(
        distSeg(x, y, cx + rr * 0.7, cy - gap * 0.5 + rr * 0.2, tipx, S * 0.78),
        distSeg(x, y, cx + rr * 0.7, cy + gap * 0.5 - rr * 0.2, tipx, S * 0.3),
      )
      const d = Math.min(ringDist, bladeDist)
      const a = Math.max(0, Math.min(1, lw / 2 - d + 0.5))
      if (a > 0) px(x, y, 42, 37, 32, a)
    }
  }
  // downsample SS×SS → size
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4
          r += buf[i]
          g += buf[i + 1]
          b += buf[i + 2]
          a += buf[i + 3]
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

for (const size of [16, 48, 128]) {
  const png = encodePng(size, draw(size))
  fs.writeFileSync(path.join(__dirname, `icon${size}.png`), png)
}
console.log('iconos generados')
