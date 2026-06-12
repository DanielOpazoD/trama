// @ts-nocheck — funciones DOM duck-typed que corren en el contexto de la
// página (no del SW). Type-checkearlas contra `Element` daría ruido sin valor;
// se verifican con sus propios tests (inject.test.js) y en el navegador.
/**
 * Funciones INYECTADAS en la página vía chrome.scripting.executeScript.
 *
 * Cada una se serializa con `.toString()` y corre en el contexto de la página
 * (mundo aislado), por lo que DEBEN ser autocontenidas: solo pueden usar
 * globals del navegador (document, window, location, chrome.runtime) y sus
 * propias funciones internas — nunca imports ni referencias de módulo.
 */

/** Lee metadatos de la página (autor de meta tags) en el contexto de la tab. */
export function readPageMeta() {
  const pick = (sel) => document.querySelector(sel)?.getAttribute('content') || null
  return {
    author:
      pick('meta[name="author"]') ||
      pick('meta[property="article:author"]') ||
      pick('meta[name="twitter:creator"]'),
    title: pick('meta[property="og:title"]') || document.title || null,
  }
}

/** Lee la selección de texto actual de la página. */
export function readSelection() {
  return window.getSelection()?.toString() ?? ''
}

/**
 * Devuelve el href del enlace asociado a la selección, o null. Primero busca un
 * <a> ANCESTRO (el caso del titular que linkea al artículo); si no, un <a>
 * DENTRO de la selección. Útil para que el recorte apunte a la noticia
 * subyacente y no a la portada.
 */
export function pageSelectionLink() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  let node = range.commonAncestorContainer
  node = node.nodeType === 1 ? node : node.parentElement
  while (node && node !== document.body) {
    if (node.tagName === 'A' && node.href && !node.href.startsWith('javascript:')) {
      return node.href
    }
    node = node.parentElement
  }
  try {
    const frag = range.cloneContents()
    const a = frag.querySelector('a[href]')
    if (a && a.href && !a.href.startsWith('javascript:')) return a.href
  } catch {
    /* sin coincidencia */
  }
  return null
}

/**
 * Captura estructurada en X/Twitter y Reddit. Usa el nodo de la selección para
 * encontrar el tweet/post que la contiene; si no hay selección, toma el
 * primero. Best-effort: ante cualquier cambio de DOM devuelve null.
 */
export function pageExtractStructured() {
  const host = location.hostname.replace(/^www\./, '')
  const sel = window.getSelection()
  const anchor = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null
  const fromAnchor = (selector) => {
    let node = anchor && anchor.nodeType === 1 ? anchor : anchor?.parentElement
    while (node && node !== document.body) {
      if (node.matches && node.matches(selector)) return node
      node = node.parentElement
    }
    return document.querySelector(selector)
  }
  try {
    if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
      const article = fromAnchor('article[data-testid="tweet"]')
      if (!article) return null
      const textEl = article.querySelector('[data-testid="tweetText"]')
      const text = textEl ? textEl.innerText.trim() : ''
      if (!text) return null
      const nameEl = article.querySelector('[data-testid="User-Name"]')
      const author = nameEl ? nameEl.innerText.split('\n')[0].trim() : null
      const timeLink = article.querySelector('a[href*="/status/"] time')
      const url = timeLink ? timeLink.parentElement.href : location.href
      return { text, author, url, title: author ? `${author} en X` : 'X' }
    }
    if (host.endsWith('reddit.com')) {
      const post = fromAnchor('shreddit-post, [data-testid="post-container"]')
      if (!post) return null
      const title =
        post.getAttribute('post-title') ||
        post.querySelector('h1, [slot="title"]')?.innerText?.trim() ||
        document.title
      const bodyEl = post.querySelector(
        '[slot="text-body"], [data-post-click-location="text-body"]',
      )
      const body = bodyEl ? bodyEl.innerText.trim() : ''
      const author = post.getAttribute('author') || null
      const permalink = post.getAttribute('permalink')
      const url = permalink ? location.origin + permalink : location.href
      const text = [title, body].filter(Boolean).join('\n\n').trim()
      if (!text) return null
      return { text, author: author ? `u/${author}` : null, url, title }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Convierte el contenedor principal de la página a Markdown conservador,
 * preservando estructura (encabezados, listas, citas, enlaces, énfasis) sin
 * librerías. Devuelve { text, title, byline } o null.
 */
export function pageExtractHTML() {
  function pickContainer() {
    function paragraphScore(el) {
      let score = 0
      const ps = el.querySelectorAll('p')
      for (let i = 0; i < ps.length; i++) {
        const len = (ps[i].innerText || '').trim().length
        if (len > 40) score += len
      }
      return score
    }
    let c = document.querySelector('article') || document.querySelector('main')
    if (c) return c
    const candidates = document.querySelectorAll('div, section')
    let best = null
    let bestScore = 0
    for (let i = 0; i < candidates.length; i++) {
      const s = paragraphScore(candidates[i])
      if (s > bestScore) {
        bestScore = s
        best = candidates[i]
      }
    }
    return best
  }

  const container = pickContainer()
  if (!container) return null

  const SKIP = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'NAV',
    'ASIDE',
    'FORM',
    'BUTTON',
    'SVG',
    'IFRAME',
  ])

  function inline(node) {
    let out = ''
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]
      if (child.nodeType === 3) {
        out += child.nodeValue.replace(/\s+/g, ' ')
      } else if (child.nodeType === 1) {
        const tag = child.tagName
        if (SKIP.has(tag)) continue
        const inner = inline(child)
        if (tag === 'A') {
          const href = child.getAttribute('href') || ''
          out += href && !href.startsWith('javascript:') ? `[${inner}](${href})` : inner
        } else if (tag === 'STRONG' || tag === 'B') {
          out += inner.trim() ? `**${inner}**` : inner
        } else if (tag === 'EM' || tag === 'I') {
          out += inner.trim() ? `*${inner}*` : inner
        } else if (tag === 'CODE') {
          out += inner.trim() ? '`' + inner + '`' : inner
        } else if (tag === 'BR') {
          out += '\n'
        } else {
          out += inner
        }
      }
    }
    return out
  }

  const lines = []
  const blocks = container.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre')
  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i]
    if (el.closest('nav, aside, form')) continue
    const tag = el.tagName
    if (tag === 'PRE') {
      const code = (el.innerText || '').replace(/\s+$/, '')
      if (code.trim()) lines.push('```\n' + code + '\n```')
      continue
    }
    const txt = inline(el)
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (!txt) continue
    if (tag === 'H1') lines.push('# ' + txt)
    else if (tag === 'H2') lines.push('## ' + txt)
    else if (tag === 'H3') lines.push('### ' + txt)
    else if (tag === 'H4') lines.push('#### ' + txt)
    else if (tag === 'LI') lines.push('- ' + txt)
    else if (tag === 'BLOCKQUOTE') lines.push('> ' + txt.replace(/\n/g, '\n> '))
    else lines.push(txt)
  }

  const md = lines
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 20000)
  if (md.trim().length < 80) return null
  const byline =
    document
      .querySelector('meta[name="author"], meta[property="article:author"]')
      ?.getAttribute('content') || null
  return { text: md, title: document.title || null, byline }
}

/**
 * Pinta la selección con un barrido dorado de marcador que se desvanece.
 * Confirmación visual de QUÉ se capturó, justo donde pasó. No muta el DOM —
 * una capa de overlays sobre los rects de la selección. Respeta reduced-motion.
 */
export function pageFlashHighlight() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
  const rects = []
  for (let i = 0; i < sel.rangeCount; i++) {
    const list = sel.getRangeAt(i).getClientRects()
    for (let j = 0; j < list.length; j++) {
      const r = list[j]
      if (r.width > 0 && r.height > 0) rects.push(r)
    }
  }
  if (rects.length === 0) return
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const layer = document.createElement('div')
  layer.setAttribute('data-trama-highlight', '')
  layer.style.cssText =
    'position:fixed;inset:0;margin:0;padding:0;z-index:2147483647;pointer-events:none;'
  rects.forEach((rect, i) => {
    const m = document.createElement('div')
    m.style.cssText =
      'position:absolute;background:rgba(160,121,0,0.34);border-radius:2px;' +
      'left:' +
      rect.left +
      'px;top:' +
      rect.top +
      'px;width:' +
      rect.width +
      'px;height:' +
      rect.height +
      'px;'
    if (!reduce && typeof m.animate === 'function') {
      m.style.clipPath = 'inset(0 100% 0 0)'
      m.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
        duration: 240,
        delay: i * 45,
        easing: 'cubic-bezier(0.25,1,0.5,1)',
        fill: 'forwards',
      })
    }
    layer.appendChild(m)
  })
  document.documentElement.appendChild(layer)
  const hold = reduce ? 350 : 650
  setTimeout(() => {
    if (typeof layer.animate === 'function') {
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' })
      setTimeout(() => layer.remove(), 440)
    } else {
      layer.remove()
    }
  }, hold)
}

/**
 * Superpone un velo con cursor de cruz y deja arrastrar un rectángulo. Al
 * soltar, esconde el velo y manda el rect (px CSS de viewport) + dpr al SW.
 * Foco real: el velo solo atenúa en estado "armado"; al arrastrar se vuelve
 * transparente y el dim queda a cargo de la sombra del recuadro → la selección
 * se ve nítida. Etiqueta con dimensiones en vivo. Pointer Events + captura para
 * que soltar fuera de la ventana no deje el overlay colgado. Escape cancela.
 */
export function regionOverlay() {
  // Evita dobles overlays si se invoca dos veces.
  if (document.getElementById('trama-region-overlay')) return
  const ARMED_BG = 'rgba(20,17,12,0.30)'
  const veil = document.createElement('div')
  veil.id = 'trama-region-overlay'
  veil.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;' +
    'background:' +
    ARMED_BG +
    ';transition:background 0.1s ease;'
  const box = document.createElement('div')
  // Sin relleno: la sombra envolvente (0.46) oscurece TODO menos el recuadro,
  // que queda transparente → la selección se ve crujiente.
  box.style.cssText =
    'position:fixed;border:1.5px solid #d4b36a;border-radius:2px;' +
    'box-shadow:0 0 0 9999px rgba(20,17,12,0.46);pointer-events:none;display:none;'
  const dims = document.createElement('div')
  dims.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;display:none;' +
    'background:#1a1812;color:#f3ead6;border-radius:6px;padding:4px 7px;' +
    'font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;'
  const hint = document.createElement('div')
  hint.textContent = 'Arrastra para recortar · Esc para cancelar'
  hint.style.cssText =
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:#1a1812;color:#f3ead6;font:600 12px Inter,system-ui,sans-serif;' +
    'padding:6px 12px;border-radius:999px;pointer-events:none;'
  veil.appendChild(box)
  veil.appendChild(dims)
  veil.appendChild(hint)
  document.documentElement.appendChild(veil)

  let startX = 0
  let startY = 0
  let dragging = false

  function rectFrom(ev) {
    const x = Math.min(startX, ev.clientX)
    const y = Math.min(startY, ev.clientY)
    const w = Math.abs(ev.clientX - startX)
    const h = Math.abs(ev.clientY - startY)
    return { x, y, w, h }
  }
  function paintBox(r) {
    box.style.left = r.x + 'px'
    box.style.top = r.y + 'px'
    box.style.width = r.w + 'px'
    box.style.height = r.h + 'px'
    dims.textContent = Math.round(r.w) + ' × ' + Math.round(r.h)
    // Debajo del recuadro si entra; si no, encima del borde superior.
    const below = r.y + r.h + 8
    dims.style.left = r.x + 'px'
    dims.style.top =
      (below + 22 < window.innerHeight ? below : Math.max(8, r.y - 26)) + 'px'
  }
  function disarm() {
    dragging = false
    veil.style.background = ARMED_BG
    box.style.display = 'none'
    dims.style.display = 'none'
    hint.style.display = 'block'
  }
  function cleanup() {
    veil.remove()
    window.removeEventListener('keydown', onKey, true)
  }
  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      cleanup()
    }
  }
  veil.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return
    dragging = true
    startX = ev.clientX
    startY = ev.clientY
    veil.setPointerCapture?.(ev.pointerId)
    // El dim pasa a la sombra del recuadro → la selección queda nítida.
    veil.style.background = 'transparent'
    box.style.display = 'block'
    dims.style.display = 'block'
    hint.style.display = 'none'
    paintBox(rectFrom(ev))
  })
  veil.addEventListener('pointermove', (ev) => {
    if (dragging) paintBox(rectFrom(ev))
  })
  veil.addEventListener('pointerup', (ev) => {
    if (!dragging) return
    const r = rectFrom(ev)
    // Clic accidental o recuadro mínimo: vuelve al estado armado, no aborta.
    if (r.w < 8 || r.h < 8) {
      disarm()
      return
    }
    dragging = false
    // Esconde el overlay ANTES de la captura para que no salga en el screenshot.
    veil.style.display = 'none'
    const payload = {
      kind: 'trama-region-rect',
      rect: r,
      dpr: window.devicePixelRatio || 1,
      url: location.href,
      title: document.title,
    }
    // Dos frames para asegurar que el repintado quitó el velo, luego avisamos.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage(payload)
        cleanup()
      })
    })
  })
  window.addEventListener('keydown', onKey, true)
}

/**
 * Inyectado: obtiene los BYTES de una imagen DESDE EL CONTEXTO DE LA PÁGINA,
 * donde ya está cargada y se cuenta con sus cookies/referer. Dos intentos:
 *   1) fetch de la página (mismo origen o con CORS) → data URL de los bytes.
 *   2) la imagen ya pintada → canvas → WebP (si no está "tainted").
 * Devuelve una data URL o null. Sirve para sitios (p.ej. diarios) que rechazan
 * el fetch directo del service worker. Autocontenida.
 * @param {string} srcUrl
 * @returns {Promise<string | null>}
 */
export async function pageGrabImage(srcUrl) {
  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  }
  // 1) fetch en el contexto de la página (incluye cookies/referer del sitio).
  try {
    const res = await fetch(srcUrl, { credentials: 'include' })
    if (res.ok) {
      const blob = await res.blob()
      if (/^image\//.test(blob.type)) return await blobToDataUrl(blob)
    }
  } catch {
    /* CORS / red: probamos el canvas */
  }
  // 2) La imagen ya decodificada en el DOM → canvas (falla si está tainted).
  try {
    const imgs = document.querySelectorAll('img')
    let target = null
    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i]
      if (im.currentSrc === srcUrl || im.src === srcUrl) {
        target = im
        break
      }
    }
    if (target && target.naturalWidth > 0) {
      const canvas = document.createElement('canvas')
      canvas.width = target.naturalWidth
      canvas.height = target.naturalHeight
      canvas.getContext('2d').drawImage(target, 0, 0)
      return canvas.toDataURL('image/webp', 0.85)
    }
  } catch {
    /* imagen de otro origen sin CORS: el canvas queda tainted */
  }
  return null
}

/**
 * Toast editorial efímero abajo a la derecha. Confirmación VISIBLE cuando el
 * popup ya está cerrado (clic derecho, atajo, región) — el badge del icono es
 * discreto. `tone`: 'ok' (salvia) | 'err' (arcilla) | otro (tinta). Respeta
 * reduced-motion. Se reemplaza si ya hay uno.
 * @param {string} message
 * @param {string} [tone]
 */
export function pageToast(message, tone) {
  const prev = document.getElementById('trama-toast')
  if (prev) prev.remove()
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const accent = tone === 'ok' ? '#4a6b4f' : tone === 'err' ? '#8a3b2e' : '#a07900'
  const el = document.createElement('div')
  el.id = 'trama-toast'
  el.setAttribute('role', 'status')
  el.style.cssText =
    'position:fixed;right:18px;bottom:18px;z-index:2147483647;pointer-events:none;' +
    'display:flex;align-items:center;gap:8px;max-width:320px;' +
    'background:#1a1812;color:#f3ead6;border-left:3px solid ' +
    accent +
    ';border-radius:8px;padding:10px 14px;box-shadow:0 8px 24px rgba(20,17,12,0.32);' +
    "font:500 13px/1.4 'Inter',system-ui,sans-serif;"
  const dot = document.createElement('span')
  dot.style.cssText =
    'width:7px;height:7px;border-radius:50%;flex:none;background:' + accent + ';'
  el.appendChild(dot)
  el.appendChild(document.createTextNode(message))
  document.documentElement.appendChild(el)
  if (!reduce && typeof el.animate === 'function') {
    el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.25,1,0.5,1)', fill: 'forwards' },
    )
  }
  setTimeout(() => {
    if (!document.getElementById('trama-toast')) return
    if (typeof el.animate === 'function') {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' })
      setTimeout(() => el.remove(), 340)
    } else {
      el.remove()
    }
  }, 2600)
}
