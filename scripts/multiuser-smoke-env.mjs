const BASE_ENV = ['E2E_BASE_URL']
const TOKEN_ENV = ['E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN']
const CLERK_MINT_ENV = ['CLERK_SECRET_KEY', 'E2E_USER_A_ID', 'E2E_USER_B_ID']
const DEFAULT_TOKEN_TTL_SECONDS = 600

function missingKeys(env, keys) {
  return keys.filter((key) => !env[key])
}

function formatMissing(keys) {
  return keys.length > 0 ? keys.join(', ') : 'ninguna'
}

export function getMissingMultiuserSmokeEnvMessage(env = process.env) {
  const missingBase = missingKeys(env, BASE_ENV)
  const missingTokenMode = missingKeys(env, [...BASE_ENV, ...TOKEN_ENV])
  const missingMintMode = missingKeys(env, [...BASE_ENV, ...CLERK_MINT_ENV])

  return (
    'multi-user smoke no ejecutado: falta configuracion real.\n' +
    'Configura una de estas dos opciones:\n' +
    'A) tokens manuales: E2E_BASE_URL + E2E_USER_A_TOKEN + E2E_USER_B_TOKEN.\n' +
    'B) tokens efimeros Clerk: E2E_BASE_URL + CLERK_SECRET_KEY + E2E_USER_A_ID + E2E_USER_B_ID.\n' +
    `Faltan para A: ${formatMissing(missingTokenMode)}.\n` +
    `Faltan para B: ${formatMissing(missingMintMode)}.\n` +
    (missingBase.length > 0
      ? 'E2E_BASE_URL debe apuntar al entorno web real que quieres probar.\n'
      : '') +
    'No guardes ni pegues tokens en chats o archivos versionados.'
  )
}

function getTokenTtlSeconds(env) {
  const raw = env.E2E_CLERK_TOKEN_TTL_SECONDS
  if (!raw) return DEFAULT_TOKEN_TTL_SECONDS

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      'E2E_CLERK_TOKEN_TTL_SECONDS debe ser un entero positivo en segundos.',
    )
  }

  return parsed
}

async function loadCreateClerkClient() {
  const { createClerkClient } = await import('@clerk/backend')
  return createClerkClient
}

async function revokeCreatedSessions(clerkClient, sessions) {
  await Promise.allSettled(
    sessions.map((sessionId) => clerkClient.sessions.revokeSession(sessionId)),
  )
}

async function mintTokenForUser(
  clerkClient,
  userId,
  expiresInSeconds,
  createdSessionIds,
) {
  const session = await clerkClient.sessions.createSession({ userId })
  if (!session?.id) {
    throw new Error(`Clerk no devolvio id de sesion para ${userId}.`)
  }

  createdSessionIds.push(session.id)
  const token = await clerkClient.sessions.getToken(
    session.id,
    undefined,
    expiresInSeconds,
  )

  if (!token?.jwt) {
    throw new Error(`Clerk no devolvio JWT para la sesion ${session.id}.`)
  }

  return token.jwt
}

function isCreateSessionUnsupported(error) {
  return error?.errors?.some?.((item) => item.code === 'request_invalid_for_environment')
}

async function mintTokenFromActiveSession(clerkClient, userId, expiresInSeconds) {
  const sessions = await clerkClient.sessions.getSessionList({
    userId,
    status: 'active',
    limit: 10,
  })
  const session = sessions.data?.[0]
  if (!session?.id) {
    throw new Error(
      `Clerk no permite crear sesiones en este entorno y ${userId} no tiene sesiones activas. Inicia sesión con ese usuario o entrega E2E_USER_*_TOKEN manualmente.`,
    )
  }

  const token = await clerkClient.sessions.getToken(
    session.id,
    undefined,
    expiresInSeconds,
  )
  if (!token?.jwt) {
    throw new Error(`Clerk no devolvio JWT para la sesion activa ${session.id}.`)
  }
  return token.jwt
}

async function resolveTokenForUser(
  clerkClient,
  userId,
  expiresInSeconds,
  createdSessionIds,
) {
  try {
    return {
      mode: 'minted-clerk-tokens',
      token: await mintTokenForUser(
        clerkClient,
        userId,
        expiresInSeconds,
        createdSessionIds,
      ),
    }
  } catch (error) {
    if (!isCreateSessionUnsupported(error)) throw error
    return {
      mode: 'active-clerk-sessions',
      token: await mintTokenFromActiveSession(clerkClient, userId, expiresInSeconds),
    }
  }
}

export async function resolveMultiuserSmokeEnv({
  env = process.env,
  createClerkClient,
} = {}) {
  const hasBase = missingKeys(env, BASE_ENV).length === 0
  const hasManualTokens = hasBase && missingKeys(env, TOKEN_ENV).length === 0
  if (hasManualTokens) {
    return {
      mode: 'provided-tokens',
      env: { ...process.env, ...env },
      cleanup: async () => {},
    }
  }

  const hasClerkMintConfig = hasBase && missingKeys(env, CLERK_MINT_ENV).length === 0
  if (!hasClerkMintConfig) {
    throw new Error(getMissingMultiuserSmokeEnvMessage(env))
  }

  const factory = createClerkClient ?? (await loadCreateClerkClient())
  const clerkClient = factory({ secretKey: env.CLERK_SECRET_KEY })
  const createdSessionIds = []
  const expiresInSeconds = getTokenTtlSeconds(env)

  try {
    const userA = await resolveTokenForUser(
      clerkClient,
      env.E2E_USER_A_ID,
      expiresInSeconds,
      createdSessionIds,
    )
    const userB = await resolveTokenForUser(
      clerkClient,
      env.E2E_USER_B_ID,
      expiresInSeconds,
      createdSessionIds,
    )

    return {
      mode:
        userA.mode === 'minted-clerk-tokens' && userB.mode === 'minted-clerk-tokens'
          ? 'minted-clerk-tokens'
          : 'active-clerk-sessions',
      env: {
        ...process.env,
        ...env,
        E2E_USER_A_TOKEN: userA.token,
        E2E_USER_B_TOKEN: userB.token,
      },
      cleanup: async () => {
        await revokeCreatedSessions(clerkClient, createdSessionIds)
      },
    }
  } catch (error) {
    await revokeCreatedSessions(clerkClient, createdSessionIds)
    throw error
  }
}
