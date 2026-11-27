import { api, ApiError } from './api'
import { getToken, setToken } from './auth'
import { isDay, today } from './dates'
import { weeks } from './weeks.svelte'
import type { Day, Household, User } from './types'

export type Route =
  | { name: 'week'; start: Day }
  | { name: 'ideas'; start: Day }
  | { name: 'want' }
  | { name: 'meals' }
  | { name: 'rate' }
  | { name: 'review' }
  | { name: 'freezer' }
  | { name: 'shop'; week: Day }
  | { name: 'meal'; id: string }
  | { name: 'settings' }

export const app = $state({
  status: 'loading' as 'loading' | 'signed-out' | 'ready',
  user: null as User | null,
  household: null as Household | null,
  error: '',
})

/* ------------------------------------------------------------------ */
/* Routing: #/week, #/week/2026-11-23, #/settings                       */
/* ------------------------------------------------------------------ */

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'settings') return { name: 'settings' }
  if (parts[0] === 'want') return { name: 'want' }
  if (parts[0] === 'ideas') return { name: 'ideas', start: parts[1] && isDay(parts[1]) ? parts[1] : today() }
  if (parts[0] === 'meals' && parts[1]) return { name: 'meal', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'meals') return { name: 'meals' }
  if (parts[0] === 'rate') return { name: 'rate' }
  if (parts[0] === 'review') return { name: 'review' }
  if (parts[0] === 'freezer') return { name: 'freezer' }
  if (parts[0] === 'shop') return { name: 'shop', week: parts[1] && isDay(parts[1]) ? parts[1] : today() } // no week: this week
  // The week view snaps this to the household's week start (it knows the setting; the hash doesn't).
  const start = parts[0] === 'week' && parts[1] && isDay(parts[1]) ? parts[1] : today()
  return { name: 'week', start }
}

let current = $state<Route>(parseHash(window.location.hash))
window.addEventListener('hashchange', () => {
  current = parseHash(window.location.hash)
})

export function route(): Route {
  return current
}

export function navigate(path: string): void {
  window.location.hash = path
}

/* ------------------------------------------------------------------ */
/* Session                                                              */
/* ------------------------------------------------------------------ */

export async function refreshHousehold(): Promise<void> {
  setHousehold((await api.household()).household)
}

/** On boot: resume a saved session (shared with HealthLog) or show sign-in. */
export async function start(): Promise<void> {
  if (!getToken()) {
    app.status = 'signed-out'
    return
  }
  try {
    app.user = (await api.me()).user
    await refreshHousehold()
    app.status = 'ready'
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setToken(null)
      app.status = 'signed-out'
      return
    }
    app.error = error instanceof Error ? error.message : String(error)
    app.status = 'signed-out'
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const result = await api.login({ email, password })
  setToken(result.token)
  app.user = result.user
  await refreshHousehold()
  app.error = ''
  app.status = 'ready'
}

export async function signOut(): Promise<void> {
  try {
    await api.logout()
  } catch {
    // Signed out locally either way.
  }
  setToken(null)
  app.user = null
  setHousehold(null)
  app.status = 'signed-out'
}

/** The household, and the week starts that come with it. */
export function setHousehold(household: Household | null): void {
  app.household = household
  weeks.starts = household?.weekStarts ?? []
}
