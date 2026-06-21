# Lighthouse y shell performance

## Medición reproducible

Para comparar producción o un deploy preview:

```bash
npm run lighthouse:summary -- /ruta/al/reporte-lighthouse.json
```

El reporte JSON puede salir de Chrome DevTools, Lighthouse CLI o la extensión de
Netlify. El resumen imprime puntajes, FCP, LCP, TBT, CLS, peso total y assets
grandes.

## Contratos actuales

- La marca de la shell (`TramaMark`) solo puede ofrecer `favicon-48.png` e
  `icon-192.png`; `trama-icon.png` queda para PWA/manifest/OG, no para imágenes
  de 22-104 px.
- Las fuentes remotas se descubren desde `index.html` con `preconnect` y
  `rel="stylesheet"` directo. No usar `@import` remoto en `src/index.css`.
- Si Netlify/Cloudflare inyecta RUM, el CSP debe permitir
  `static.cloudflareinsights.com` en `script-src` y `cloudflareinsights.com` en
  `connect-src`.
