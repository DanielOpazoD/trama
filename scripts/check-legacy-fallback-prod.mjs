import { pathToFileURL } from 'node:url'

export function checkLegacyFallbackProd(env = process.env) {
  const isProduction =
    env.CONTEXT === 'production' ||
    env.NETLIFY_CONTEXT === 'production' ||
    (Boolean(env.DEPLOY_PRIME_URL) &&
      Boolean(env.URL) &&
      env.DEPLOY_PRIME_URL === env.URL)

  const hasBackendClerk = Boolean(env.CLERK_SECRET_KEY)
  const hasFrontendClerk = Boolean(env.VITE_CLERK_PUBLISHABLE_KEY)

  if (hasBackendClerk !== hasFrontendClerk) {
    return {
      ok: false,
      message:
        'Configuración Clerk incompleta: CLERK_SECRET_KEY y VITE_CLERK_PUBLISHABLE_KEY deben setearse juntas. Si solo una existe, el front y las functions quedan en modos distintos.',
    }
  }

  if (isProduction && (!hasBackendClerk || !hasFrontendClerk)) {
    return {
      ok: false,
      message:
        'Clerk es obligatorio en producción: CLERK_SECRET_KEY y VITE_CLERK_PUBLISHABLE_KEY deben estar configuradas para evitar modo legacy.',
    }
  }

  if (isProduction && env.ALLOW_LEGACY_FALLBACK === 'true') {
    return {
      ok: false,
      message:
        'ALLOW_LEGACY_FALLBACK=true no está permitido en producción. Desactívalo antes de deployar.',
    }
  }

  return { ok: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkLegacyFallbackProd()
  if (!result.ok) {
    console.error(result.message)
    process.exit(1)
  }
  console.log('multi-user deployment guard ok')
}
