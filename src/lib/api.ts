import { getToken } from './auth'
import type { Day, Household, Meal, MealNote, NightKind, ParsedNight, Partner, PlanEntry, RatedAs, Rating, User, Week } from './types'

declare global {
  interface Window {
    APP_API_BASE?: string
  }
}

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function baseUrl(): string {
  const configured = window.APP_API_BASE?.trim()
  return (configured || window.location.origin).replace(/\/+$/, '')
}

/** The only fetch in the app. Talks to the HealthLog API. */
async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController()
  const external = options.signal
  const abort = (): void => controller.abort(external?.reason)
  if (external?.aborted) abort()
  else external?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 20_000)

  const headers = new Headers(init.body === undefined ? undefined : { 'Content-Type': 'application/json' })
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    const response = await fetch(`${baseUrl()}/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })
    const payload = response.status === 204 ? null : await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload && typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
      throw new ApiError(message, response.status)
    }
    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted && !external?.aborted) {
      throw new ApiError('That took too long. Please try again.', 0)
    }
    if (external?.aborted) throw error
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  } finally {
    window.clearTimeout(timeout)
    external?.removeEventListener('abort', abort)
  }
}

interface Ok {
  ok: true
}

export const api = {
  login(credentials: { email: string; password: string }): Promise<Ok & { token: string; user: User }> {
    return request('/auth/login', { method: 'POST', body: credentials })
  },

  logout(): Promise<Ok> {
    return request('/auth/logout', { method: 'POST' })
  },

  me(options?: RequestOptions): Promise<Ok & { user: User }> {
    return request('/auth/me', {}, options)
  },

  household(options?: RequestOptions): Promise<Ok & { household: Household }> {
    return request('/planner/household', {}, options)
  },

  setPartner(email: string): Promise<Ok & { partner: Partner | null }> {
    return request('/partner', { method: 'PUT', body: { email } })
  },

  meals(options?: RequestOptions): Promise<Ok & { meals: Meal[] }> {
    return request('/planner/meals', {}, options)
  },

  updateMeal(
    id: string,
    patch: Partial<Pick<Meal, 'tags' | 'suggestedTags' | 'effort' | 'tips' | 'neverSuggest'>> & { archived?: boolean },
  ): Promise<Ok & { meal: Meal | null }> {
    return request(`/planner/meals/${encodeURIComponent(id)}`, { method: 'PUT', body: patch })
  },

  setRating(body: {
    dishId: string
    optionId: string | null
    ratedAs: RatedAs
    thumbs: -1 | 1 | null
    stars: number | null
    want?: boolean
  }): Promise<Ok & { rating: Rating | null }> {
    return request('/planner/ratings', { method: 'PUT', body })
  },

  setHidden(mealId: string, optionId: string, hidden: boolean): Promise<Ok & { hidden: string[] }> {
    return request(`/planner/meals/${encodeURIComponent(mealId)}/hidden`, { method: 'PUT', body: { optionId, hidden } })
  },

  addNote(mealId: string, body: string): Promise<Ok & { note: MealNote }> {
    return request(`/planner/meals/${encodeURIComponent(mealId)}/notes`, { method: 'POST', body: { body } })
  },

  setHousehold(patch: { weekStartDay?: number }): Promise<Ok & { household: Household }> {
    return request('/planner/household', { method: 'PUT', body: patch })
  },

  createMeal(name: string): Promise<Ok & { created: boolean; meal: Meal }> {
    return request('/planner/meals', { method: 'POST', body: { name } })
  },

  addAlias(mealId: string, alias: string): Promise<Ok & { alias: string }> {
    return request(`/planner/meals/${encodeURIComponent(mealId)}/aliases`, { method: 'POST', body: { alias } })
  },

  week(start: Day, options?: RequestOptions): Promise<Ok & { week: Week }> {
    return request(`/planner/week?start=${encodeURIComponent(start)}`, {}, options)
  },

  setNight(
    date: Day,
    body: { kind: NightKind; dishId?: string | null; optionIds?: string[]; note?: string | null; raw?: string | null },
  ): Promise<Ok & { entry: PlanEntry }> {
    return request(`/planner/slots/${encodeURIComponent(date)}`, { method: 'PUT', body })
  },

  clearNight(date: Day): Promise<Ok> {
    return request(`/planner/slots/${encodeURIComponent(date)}`, { method: 'DELETE' })
  },

  copyWeek(from: Day, to: Day): Promise<Ok & { copied: number; week: Week }> {
    return request('/planner/week/copy', { method: 'POST', body: { from, to } })
  },

  parseWeek(start: Day, text: string): Promise<Ok & { items: ParsedNight[] }> {
    return request('/planner/parse-week', { method: 'POST', body: { start, text } }, { timeoutMs: 40_000 })
  },
}
