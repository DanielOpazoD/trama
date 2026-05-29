# Security Policy

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en Trama:

1. **NO abras un issue público en GitHub.**
2. Mandá un email a [d.opazo.damiani@gmail.com](mailto:d.opazo.damiani@gmail.com) con:
   - Descripción del problema.
   - Steps to reproduce.
   - Impacto que ves (data leak, RCE, XSS, etc.).
   - Versión / commit hash donde lo encontraste.

Voy a responder dentro de 48hs hábiles (vivo en UTC-3 / Argentina).

## Scope

Lo que SÍ es vulnerabilidad de seguridad:

- Auth bypass (request sin Bearer válido que devuelve data privada).
- SQL injection en cualquier query.
- XSS (especialmente vía `dangerouslySetInnerHTML` o markdown).
- Server-side request forgery (SSRF) en endpoints que hacen fetch externo.
- Disclosure de secrets (API keys en respuestas, logs públicos).
- Path traversal en endpoints que reciben filenames.
- Subdomain takeover.

Lo que NO es vulnerabilidad reportable acá:

- "El admin panel está sin password" — Trama hoy es single-user, no hay admin separado.
- "El cron de Spotify es público" — sí, es intencional (no toma input del request).
- Dependabot advisories en deps transitives sin path explotable (reportá igual, las miramos).

## Disclosure timeline

- **48hs** — confirmación de recepción.
- **7 días** — primera evaluación, plan de fix.
- **30 días** — fix aplicado y deployed.
- **90 días** — public disclosure (con tu crédito si querés).

## Hardening actual

Lo que ya está cableado al cierre del Tier N (este commit):

- CSP + HSTS + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy en `netlify.toml`.
- Per-user data isolation (multi-user infra ya en main, Clerk pendiente activación).
- `getAuthedUser` en todos los endpoints que manejan data privada.
- Soft delete + cascade defensivo.
- Rate limit por user vía monthly LLM budget cap.
- Validación Zod en todos los request bodies.
- Dependabot weekly + `npm audit` en CI (production deps).
- ErrorBoundary granular + persistError filtrado por user.
- Secret scanning con [gitleaks](https://github.com/gitleaks/gitleaks): job `secrets` en CI que escanea todo el historial de git, más un hook de pre-commit que escanea los cambios staged. Config y allowlist en `.gitleaks.toml`. Para correrlo local: `brew install gitleaks`.

Si encontrás algo que escape de esto, escribime.
