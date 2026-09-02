/**
 * Authenticated user from Bearer token (no MFA requirement).
 * @param {import('h3').H3Event} event
 */
export async function requireUser(event) {
  return requireVerifiedUser(event)
}
