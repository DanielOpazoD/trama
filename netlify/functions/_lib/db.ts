import { getDatabase, type ServerlessDatabaseConnection } from '@netlify/database'

/**
 * Returns the Neon HTTP client (`sql\`SELECT ...\`` tagged template) that the
 * Netlify Database extension wires up at runtime via NETLIFY_DB_URL.
 *
 * The legacy setup read NETLIFY_DATABASE_URL with @neondatabase/serverless
 * directly; that variable was retired with the deprecated @netlify/neon
 * extension. The httpClient exposed by @netlify/database is the same Neon HTTP
 * function, so all callers keep their existing template literals unchanged.
 */
export function getSql(): ServerlessDatabaseConnection['httpClient'] {
  const conn = getDatabase()
  if (conn.driver !== 'serverless') {
    throw new Error(
      `Expected serverless DB driver but got '${conn.driver}'. Functions only run on Neon HTTP.`,
    )
  }
  return conn.httpClient
}
