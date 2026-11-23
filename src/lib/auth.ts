/**
 * The session token. The key is HealthLog's own: both apps are served from the
 * same GitHub Pages origin, so signing in to one signs you in to the other.
 */
const TOKEN_KEY = 'healthlog:token'
let memoryToken: string | null = null

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken
  } catch {
    return memoryToken
  }
}

export function setToken(token: string | null): void {
  memoryToken = token
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the token still works for this page load.
  }
}
