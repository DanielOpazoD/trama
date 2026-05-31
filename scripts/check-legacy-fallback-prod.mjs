const isProduction =
  process.env.CONTEXT === 'production' ||
  process.env.NETLIFY_CONTEXT === 'production' ||
  process.env.DEPLOY_PRIME_URL === process.env.URL

const hasBackendClerk = Boolean(process.env.CLERK_SECRET_KEY)
const hasFrontendClerk = Boolean(process.env.VITE_CLERK_PUBLISHABLE_KEY)

if (hasBackendClerk !== hasFrontendClerk) {
  console.error(
    'Configuración Clerk incompleta: CLERK_SECRET_KEY y VITE_CLERK_PUBLISHABLE_KEY deben setearse juntas. Si solo una existe, el front y las functions quedan en modos distintos.',
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
