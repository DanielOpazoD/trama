const isProduction =
  process.env.CONTEXT === 'production' ||
  process.env.NETLIFY_CONTEXT === 'production' ||
  (Boolean(process.env.DEPLOY_PRIME_URL) &&
    Boolean(process.env.URL) &&
    process.env.DEPLOY_PRIME_URL === process.env.URL)

const hasBackendClerk = Boolean(process.env.CLERK_SECRET_KEY)
const hasFrontendClerk = Boolean(process.env.VITE_CLERK_PUBLISHABLE_KEY)

if (hasBackendClerk !== hasFrontendClerk) {
  console.error(
    'Configuración Clerk incompleta: CLERK_SECRET_KEY y VITE_CLERK_PUBLISHABLE_KEY deben setearse juntas. Si solo una existe, el front y las functions quedan en modos distintos.',
  )
  process.exit(1)
}

// Independiente del contexto: si la auth real (Clerk) ya está configurada en el
// backend, el bypass legacy NO puede seguir activo. Sin esto, una request sin
// token caería a `legacy-single-user` y leería/escribiría todo el dataset del
// dueño. Cierra el footgun aunque la detección de "producción" falle (branch
// deploy, contexto mal seteado): el momento en que la auth real entra, el
// fallback debe estar apagado.
if (hasBackendClerk && process.env.ALLOW_LEGACY_FALLBACK === 'true') {
  console.error(
    'ALLOW_LEGACY_FALLBACK=true es incompatible con CLERK_SECRET_KEY configurado: desactiva el fallback legacy cuando la autenticación real está activa.',
  )
  process.exit(1)
}

if (isProduction && (!hasBackendClerk || !hasFrontendClerk)) {
  console.error(
    'Clerk es obligatorio en producción: CLERK_SECRET_KEY y VITE_CLERK_PUBLISHABLE_KEY deben estar configuradas para evitar modo legacy.',
  )
  process.exit(1)
}

if (isProduction && process.env.ALLOW_LEGACY_FALLBACK === 'true') {
  console.error(
    'ALLOW_LEGACY_FALLBACK=true no está permitido en producción. Desactívalo antes de deployar.',
  )
  process.exit(1)
}

console.log('multi-user deployment guard ok')
