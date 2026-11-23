import { api } from './api'
import type { Meal, RatedAs, Rating } from './types'

export const meals = $state({
  list: [] as Meal[],
  loaded: false,
  loading: false,
  error: '',
})

/* ------------------------------------------------------------------ */
/* Who we're rating as: 'both' or a member id. Remembered per device.  */
/* ------------------------------------------------------------------ */

const PERSONA_KEY = 'mealplan:rating-as'
function readPersona(): RatedAs {
  try {
    return window.localStorage.getItem(PERSONA_KEY) || 'both'
  } catch {
    return 'both'
  }
}
export const persona = $state({ value: readPersona() })
export function setPersona(value: RatedAs): void {
  persona.value = value
  try {
    window.localStorage.setItem(PERSONA_KEY, value)
  } catch {
    // Not remembered; fine.
  }
}

/* ------------------------------------------------------------------ */
/* Loading + ordering                                                   */
/* ------------------------------------------------------------------ */

export async function loadMeals(force = false): Promise<void> {
  if (meals.loading || (meals.loaded && !force)) return
  meals.loading = true
  meals.error = ''
  try {
    meals.list = (await api.meals()).meals
    meals.loaded = true
  } catch (e) {
    meals.error = e instanceof Error ? e.message : String(e)
  } finally {
    meals.loading = false
  }
}

/** Most cooked first, then A–Z: the order we rate in. */
export function sortedMeals(list: Meal[]): Meal[] {
  return [...list].sort((a, b) => b.cooked - a.cooked || a.name.localeCompare(b.name))
}

export function ratingFor(meal: Meal, optionId: string | null, ratedAs: RatedAs): Rating | undefined {
  return meal.ratings.find((r) => (r.optionId ?? null) === optionId && r.ratedAs === ratedAs)
}

/** Rated by this persona at the meal level? */
export function isRated(meal: Meal, ratedAs: RatedAs): boolean {
  return Boolean(ratingFor(meal, null, ratedAs))
}

/** How many meals this persona has rated (meal level). */
export function ratedCount(list: Meal[], ratedAs: RatedAs): number {
  return list.filter((m) => isRated(m, ratedAs)).length
}

/** The next meal this persona hasn't rated, in rating order, skipping `skipped`. */
export function nextUnrated(list: Meal[], ratedAs: RatedAs, skipped: Set<string>): Meal | undefined {
  return sortedMeals(list).find((m) => !isRated(m, ratedAs) && !skipped.has(m.id))
}

export const MILESTONES = [10, 25, 50, 75, 100]

/** Message for reaching `count` of `total`, or null when it's not a milestone. */
export function milestone(count: number, total: number): string | null {
  if (total > 0 && count === total) return `Every meal rated. All ${total}!`
  if (MILESTONES.includes(count)) {
    const left = total - count
    return `${count} rated! ${left} to go.`
  }
  return null
}

export function axes(meal: Meal): { axis: string; options: Meal['options'] }[] {
  const out = new Map<string, Meal['options']>()
  for (const o of meal.options) out.set(o.axis, [...(out.get(o.axis) ?? []), o])
  return [...out].map(([axis, options]) => ({ axis, options }))
}

/* ------------------------------------------------------------------ */
/* Writes: optimistic, reverted on failure                              */
/* ------------------------------------------------------------------ */

function mealById(id: string): Meal | undefined {
  return meals.list.find((m) => m.id === id)
}

export async function rate(
  mealId: string,
  optionId: string | null,
  ratedAs: RatedAs,
  next: { thumbs: -1 | 1 | null; stars: number | null },
): Promise<void> {
  const meal = mealById(mealId)
  if (!meal) return
  const before = meal.ratings.map((r) => ({ ...r }))
  const others = meal.ratings.filter((r) => !((r.optionId ?? null) === optionId && r.ratedAs === ratedAs))
  meal.ratings = next.thumbs === null && next.stars === null ? others : [...others, { optionId, ratedAs, ...next }]
  try {
    const { rating } = await api.setRating({ dishId: mealId, optionId, ratedAs, ...next })
    // ratedAs 'me' comes back as an id; keep the stored key consistent.
    if (rating && rating.ratedAs !== ratedAs) {
      meal.ratings = meal.ratings.map((r) => (r.optionId === optionId && r.ratedAs === ratedAs ? rating : r))
    }
  } catch (e) {
    meal.ratings = before
    throw e
  }
}

export async function saveMeal(
  mealId: string,
  patch: Partial<Pick<Meal, 'tags' | 'suggestedTags' | 'effort' | 'tips' | 'neverSuggest'>>,
): Promise<void> {
  const meal = mealById(mealId)
  if (!meal) return
  const before = { tags: meal.tags, suggestedTags: meal.suggestedTags, effort: meal.effort, tips: meal.tips, neverSuggest: meal.neverSuggest }
  Object.assign(meal, patch)
  try {
    const saved = (await api.updateMeal(mealId, patch)).meal
    if (saved) Object.assign(meal, { tags: saved.tags, suggestedTags: saved.suggestedTags, effort: saved.effort, tips: saved.tips, neverSuggest: saved.neverSuggest })
  } catch (e) {
    Object.assign(meal, before)
    throw e
  }
}

export async function addNote(mealId: string, body: string): Promise<void> {
  const meal = mealById(mealId)
  if (!meal) return
  const { note } = await api.addNote(mealId, body)
  meal.notes = [...meal.notes, note]
}
