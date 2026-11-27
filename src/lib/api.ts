import { getToken } from './auth'
import type { Day, FreezerItem, Household, Meal, MealNote, NightKind, ParsedNight, Partner, PlanEntry, RatedAs, Rating, ReviewEntry, Section, ShoppingItem, ShoppingWeek, User, WantLevel, WantLine, Week } from './types'

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

/** Binary in or out (photos): the same base and token as `request`, no JSON. */
async function binary(path: string, init: { method?: string; body?: Blob; type?: string } = {}): Promise<Response> {
  const headers = new Headers(init.type ? { 'Content-Type': init.type } : undefined)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${baseUrl()}/api${path}`, { method: init.method ?? 'GET', headers, body: init.body })
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload && typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`, response.status)
  }
  return response
}

/** The only JSON fetch in the app. Talks to the HealthLog API. */
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
    patch: Partial<Pick<Meal, 'tags' | 'suggestedTags' | 'effort' | 'tips' | 'neverSuggest' | 'regularEveryDays' | 'coverPhotoId'>> & { archived?: boolean },
  ): Promise<Ok & { meal: Meal | null }> {
    return request(`/planner/meals/${encodeURIComponent(id)}`, { method: 'PUT', body: patch })
  },

  setRating(body: {
    dishId: string
    optionId: string | null
    ratedAs: RatedAs
    thumbs: -1 | 1 | null
    stars: number | null
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

  /** "This week starts on Thursday". `replaces`: the week's own start, if it was one. */
  setWeekStart(date: Day, replaces?: Day): Promise<Ok & { household: Household }> {
    return request('/planner/week-starts', { method: 'PUT', body: { date, replaces } })
  },

  createMeal(name: string): Promise<Ok & { created: boolean; meal: Meal }> {
    return request('/planner/meals', { method: 'POST', body: { name } })
  },

  addAlias(mealId: string, alias: string): Promise<Ok & { alias: string }> {
    return request(`/planner/meals/${encodeURIComponent(mealId)}/aliases`, { method: 'POST', body: { alias } })
  },

  wants(options?: RequestOptions): Promise<Ok & { wants: WantLine[] }> {
    return request('/planner/wants', {}, options)
  },

  /**
   * A want-to-make line typed like a note: saved at once; linked to a meal only when the server is sure.
   * With `meal`, it's for that meal and variation (an open line for it already comes back as it is).
   */
  addWant(text: string, level: WantLevel, meal?: { dishId: string; optionIds: string[] }): Promise<Ok & { want: WantLine; pending: boolean }> {
    return request('/planner/wants', { method: 'POST', body: { text, level, ...meal } })
  },

  updateWant(
    id: string,
    patch: { text?: string; level?: WantLevel; dishId?: string | null; optionIds?: string[]; done?: boolean },
  ): Promise<Ok & { want: WantLine; pending: boolean }> {
    return request(`/planner/wants/${encodeURIComponent(id)}`, { method: 'PUT', body: patch })
  },

  /** In the background: try harder (AI, with our meals) to find which meal the words are. */
  matchWant(id: string): Promise<Ok & { matched: boolean; want: WantLine; candidates: { dishId: string; name: string; confidence: number }[] }> {
    return request(`/planner/wants/${encodeURIComponent(id)}/match`, { method: 'POST' }, { timeoutMs: 40_000 })
  },

  removeWant(id: string): Promise<Ok> {
    return request(`/planner/wants/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  week(start: Day, options?: RequestOptions & { days?: number }): Promise<Ok & { week: Week }> {
    return request(`/planner/week?start=${encodeURIComponent(start)}&days=${options?.days ?? 7}`, {}, options)
  },

  setNight(
    date: Day,
    body: { kind: NightKind; dishId?: string | null; optionIds?: string[]; note?: string | null; raw?: string | null; freezerItemId?: string },
  ): Promise<Ok & { entry: PlanEntry }> {
    return request(`/planner/slots/${encodeURIComponent(date)}`, { method: 'PUT', body })
  },

  clearNight(date: Day): Promise<Ok> {
    return request(`/planner/slots/${encodeURIComponent(date)}`, { method: 'DELETE' })
  },

  /** A night typed like a note: saved as the words; linked to a meal only when the server is sure. */
  textNight(date: Day, text: string): Promise<Ok & { entry: PlanEntry | null; pending: boolean }> {
    return request(`/planner/slots/${encodeURIComponent(date)}/text`, { method: 'PUT', body: { text } })
  },

  /** In the background: try harder (AI, with our meals) to find which meal the words are. */
  matchNight(date: Day): Promise<Ok & { matched: boolean; entry: PlanEntry | null; candidates: { dishId: string; name: string; confidence: number }[] }> {
    return request(`/planner/slots/${encodeURIComponent(date)}/match`, { method: 'POST' }, { timeoutMs: 40_000 })
  },

  linkNight(date: Day, dishId: string | null, optionIds: string[] = []): Promise<Ok & { entry: PlanEntry }> {
    return request(`/planner/slots/${encodeURIComponent(date)}/link`, { method: 'PUT', body: { dishId, optionIds } })
  },

  moveNight(from: Day, to: Day): Promise<Ok & { moved: number; swapped?: boolean }> {
    return request('/planner/slots/move', { method: 'POST', body: { from, to } })
  },

  copyWeek(from: Day, to: Day): Promise<Ok & { copied: number; week: Week }> {
    return request('/planner/week/copy', { method: 'POST', body: { from, to } })
  },

  parseWeek(start: Day, text: string): Promise<Ok & { items: ParsedNight[] }> {
    return request('/planner/parse-week', { method: 'POST', body: { start, text } }, { timeoutMs: 40_000 })
  },

  review(today: Day): Promise<Ok & { entries: ReviewEntry[] }> {
    return request(`/planner/review?today=${encodeURIComponent(today)}`)
  },

  updateEntry(
    id: string,
    patch: {
      status?: 'cooked' | 'skipped' | 'planned'
      swapToDishId?: string
      swapOptionIds?: string[]
      cookNote?: string | null
      leftovers?: boolean
      frozenPortions?: number
      tweakRetry?: boolean
    },
  ): Promise<Ok & { entry: ReviewEntry }> {
    return request(`/planner/entries/${encodeURIComponent(id)}`, { method: 'PUT', body: patch })
  },

  setReview(id: string, body: { ratedAs: RatedAs; thumbs: -1 | 1 | null; stars: number | null }): Promise<Ok & { entry: ReviewEntry }> {
    return request(`/planner/entries/${encodeURIComponent(id)}/review`, { method: 'PUT', body })
  },

  freezer(): Promise<Ok & { items: FreezerItem[] }> {
    return request('/planner/freezer')
  },

  addFreezer(body: { dishId: string; optionIds?: string[]; portions: number; frozenOn?: Day }): Promise<Ok & { item: FreezerItem }> {
    return request('/planner/freezer', { method: 'POST', body })
  },

  setFreezerPortions(id: string, portions: number): Promise<Ok & { item: FreezerItem }> {
    return request(`/planner/freezer/${encodeURIComponent(id)}`, { method: 'PUT', body: { portions } })
  },

  async uploadPhoto(dishId: string, entryId: string | null, jpeg: Blob): Promise<{ id: string }> {
    const q = `?dishId=${encodeURIComponent(dishId)}${entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''}`
    const res = await binary(`/planner/photos${q}`, { method: 'POST', body: jpeg, type: 'image/jpeg' })
    return (await res.json()).photo
  },

  async photo(id: string): Promise<Blob> {
    return (await binary(`/planner/photos/${encodeURIComponent(id)}`)).blob()
  },

  deletePhoto(id: string): Promise<Ok> {
    return request(`/planner/photos/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  parseReview(
    today: Day,
    text: string,
  ): Promise<Ok & { items: { entryId: string; status: 'cooked' | 'skipped'; stars: number | null; thumbs: -1 | 1 | null; note: string | null }[]; by: string }> {
    return request('/planner/parse-review', { method: 'POST', body: { today, text } }, { timeoutMs: 40_000 })
  },

  history(): Promise<Ok & { entries: { dishId: string; date: Day }[]; importedWeeks: number }> {
    return request('/planner/history')
  },

  snooze(mealId: string, today: Day, days = 21): Promise<Ok & { until: Day | null }> {
    return request(`/planner/meals/${encodeURIComponent(mealId)}/snooze`, { method: 'PUT', body: { today, days } })
  },

  shoppingLists(): Promise<Ok & { lists: { from: Day; to: Day }[] }> {
    return request('/planner/shopping/lists')
  },

  /** The nights a list shops for. */
  setShoppingRange(week: Day, to: Day): Promise<Ok & ShoppingWeek> {
    return request('/planner/shopping/range', { method: 'PUT', body: { week, to } })
  },

  shopping(week: Day, options?: RequestOptions): Promise<Ok & ShoppingWeek> {
    return request(`/planner/shopping?week=${encodeURIComponent(week)}`, {}, options)
  },

  addShoppingItem(body: { week: Day; name: string; qty?: string | null; dishId?: string | null; section?: Section | null }): Promise<Ok & { item: ShoppingItem }> {
    return request('/planner/shopping/items', { method: 'POST', body }, { timeoutMs: 15_000 })
  },

  updateShoppingItem(id: string, patch: { checked?: boolean; qty?: string | null; section?: Section }): Promise<Ok & { item: ShoppingItem }> {
    return request(`/planner/shopping/items/${encodeURIComponent(id)}`, { method: 'PUT', body: patch })
  },

  removeShoppingItem(id: string, dishId?: string): Promise<Ok & { item: ShoppingItem | null }> {
    return request(`/planner/shopping/items/${encodeURIComponent(id)}${dishId ? `?dishId=${encodeURIComponent(dishId)}` : ''}`, { method: 'DELETE' })
  },

  clearChecked(week: Day): Promise<Ok & { cleared: number }> {
    return request(`/planner/shopping/checked?week=${encodeURIComponent(week)}`, { method: 'DELETE' })
  },
}
