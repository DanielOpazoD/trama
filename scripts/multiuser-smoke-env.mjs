const BASE_ENV = ['E2E_BASE_URL']
const TOKEN_ENV = ['E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN']
const MOMENTOS_SHARED_ENV = ['E2E_USER_B_EMAIL']
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
  const missingTokenMode = missingKeys(env, [
    ...BASE_ENV,
    ...TOKEN_ENV,
    ...MOMENTOS_SHARED_ENV,
  ])
  const missingMintMode = missingKeys(env, [...BASE_ENV, ...CLERK_MINT_ENV])

  return (
    'multi-user smoke no ejecutado: falta configuracion real.\n' +
    'Configura una de estas dos opciones:\n' +
    'A) tokens manuales: E2E_BASE_URL + E2E_USER_A_TOKEN + E2E_USER_B_TOKEN + E2E_USER_B_EMAIL.\n' +
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

function primaryEmailFromClerkUser(user) {
  const emails = Array.isArray(user?.emailAddresses) ? user.emailAddresses : []
  const primary =
    emails.find((email) => email.id === user?.primaryEmailAddressId) ?? emails[0]
  return typeof primary?.emailAddress === 'string' && primary.emailAddress
    ? primary.emailAddress
    : null
}

function clerkErrorDetails(error) {
  const status =
    typeof error?.status === 'number'
      ? error.status
      : typeof error?.statusCode === 'number'
        ? error.statusCode
        : typeof error?.response?.status === 'number'
          ? error.response.status
          : null
  const code =
    typeof error?.code === 'string'
      ? error.code
      : typeof error?.errors?.[0]?.code === 'string'
        ? error.errors[0].code
        : null
  const message =
    typeof error?.message === 'string' && error.message
      ? error.message
      : 'error desconocido'

  return [status ? `status ${status}` : null, code ? `code ${code}` : null].filter(
    Boolean,
  ).length > 0
    ? `(${[status ? `status ${status}` : null, code ? `code ${code}` : null].filter(Boolean).join(', ')}): ${message}`
    : `: ${message}`
}

function wrapClerkError(stage, error) {
  return new Error(`Clerk rechazo ${stage} ${clerkErrorDetails(error)}`)
}

async function getClerkUser(clerkClient, userId, userLabel) {
  try {
    return await clerkClient.users.getUser(userId)
  } catch (error) {
    throw wrapClerkError(`getUser para ${userLabel}`, error)
  }
}

function assertDifferentSmokeUsers(userAId, userBId) {
  if (userAId === userBId) {
    throw new Error('E2E_USER_A_ID y E2E_USER_B_ID deben ser usuarios distintos.')
  }
}

function resolveEmailFromClerkUser(user, userLabel) {
  const email = primaryEmailFromClerkUser(user)
  if (!email) {
    throw new Error(
      `No se pudo resolver email desde Clerk para ${userLabel}. ` +
        'Configuralo manualmente para ejecutar el smoke de Momentos compartidos.',
    )
  }
  return email
}

async function revokeCreatedSessions(clerkClient, sessions) {
  await Promise.allSettled(
    sessions.map((sessionId) => clerkClient.sessions.revokeSession(sessionId)),
  )
}

async function mintTokenForUser(
  clerkClient,
  userId,
  userLabel,
  expiresInSeconds,
  createdSessionIds,
) {
  let session
  try {
    session = await clerkClient.sessions.createSession({ userId })
  } catch (error) {
    throw wrapClerkError(`createSession para ${userLabel}`, error)
  }
  if (!session?.id) {
    throw new Error(`Clerk no devolvio id de sesion para ${userLabel}.`)
  }

  createdSessionIds.push(session.id)
  let token
  try {
    token = await clerkClient.sessions.getToken(session.id, undefined, expiresInSeconds)
  } catch (error) {
    throw wrapClerkError(`getToken para ${userLabel}`, error)
  }

  if (!token?.jwt) {
    throw new Error(`Clerk no devolvio JWT para ${userLabel}.`)
  }

  return token.jwt
}

export async function resolveMultiuserSmokeEnv({
  env = process.env,
  createClerkClient,
} = {}) {
  const hasBase = missingKeys(env, BASE_ENV).length === 0
  const hasManualTokens =
    hasBase && missingKeys(env, [...TOKEN_ENV, ...MOMENTOS_SHARED_ENV]).length === 0
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
    assertDifferentSmokeUsers(env.E2E_USER_A_ID, env.E2E_USER_B_ID)
    await getClerkUser(clerkClient, env.E2E_USER_A_ID, 'E2E_USER_A_ID')
    const userB =
      env.E2E_USER_B_EMAIL === undefined
        ? await getClerkUser(clerkClient, env.E2E_USER_B_ID, 'E2E_USER_B_ID')
        : null
    const userBEmail =
      env.E2E_USER_B_EMAIL ?? resolveEmailFromClerkUser(userB, 'E2E_USER_B_ID')
    const userAToken = await mintTokenForUser(
      clerkClient,
      env.E2E_USER_A_ID,
      'E2E_USER_A_ID',
      expiresInSeconds,
      createdSessionIds,
    )
    const userBToken = await mintTokenForUser(
      clerkClient,
      env.E2E_USER_B_ID,
      'E2E_USER_B_ID',
      expiresInSeconds,
      createdSessionIds,
    )

    return {
      mode: 'minted-clerk-tokens',
      env: {
        ...process.env,
        ...env,
        E2E_USER_A_TOKEN: userAToken,
        E2E_USER_B_TOKEN: userBToken,
        E2E_USER_B_EMAIL: userBEmail,
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
