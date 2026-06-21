# DevTools AI Debugging Runbook

Chrome DevTools AI puede ayudar a diagnosticar Trama, pero no es parte del
runtime ni reemplaza tests, Sentry futuro o profiling real.

## Regla de privacidad

No copies a DevTools AI:

- texto de notas, recortes, citas, prompts o chats;
- PDFs, attachments, firmas o timbres;
- JWT, cookies, Clerk session ids, PATs, API keys;
- emails completos, telefonos o nombres de pacientes/personas;
- `storageKey`, `imageKey`, `audioKey`, rutas privadas completas de blobs.

Si necesitas contexto, usa placeholders: `user_a`, `request_id`, `endpoint_x`,
`storage_key_hash`.

## Protocolo corto

1. **Console**
   - Captura el error exacto y stack frame principal.
   - Redacta tokens, emails y payloads antes de pegarlo.
   - Convierte el hallazgo en test o issue si se repite.

2. **Network**
   - Mira endpoint, status, `x-request-id`, tiempo total y tamaño.
   - No copies payloads completos. Resume forma: `POST /api/notes -> 500`.
   - Correlaciona `x-request-id` con `error_log` o logs Netlify.

3. **Performance**
   - Usa recording corto: cargar Inicio, abrir Notas Feed, PDF Studio,
     Settings o CommandPalette.
   - Busca long tasks, scripting excesivo y layout shifts.
   - Si el problema es bundle/lazy loading, valida con `npm run build` y
     `node scripts/check-bundle-size.mjs`.

4. **Elements**
   - Inspecciona overflow, stacking context, foco, roles y tamanos.
   - No pegues texto sensible visible en pantalla.

5. **Sources**
   - Usa sourcemaps locales para ubicar frame y componente.
   - Si el error depende de release productivo, anota commit/deploy.

## Prompt recomendado

```text
Ayudame a diagnosticar este bug de Trama usando DevTools. No hay datos privados.
Tengo: endpoint/status/requestId, stack redactado, componente sospechoso y pasos.
Quiero hipotesis verificables, archivos probables y una propuesta de test minimo.
No propongas reescrituras grandes ni nuevas dependencias.
```

## Salida esperada

Cada investigacion deberia terminar en uno de estos artefactos:

- issue con pasos reproducibles y `requestId`;
- test focalizado;
- PR pequeno de frontera/contrato;
- entrada en `docs/observability.md` si cambia el runbook.
