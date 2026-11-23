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

/**
 * Most cooked first, then A–Z: the order we rate in. A section (family) stays
 * together, placed where its most-cooked meal would be.
 */
export function sortedMeals(list: Meal[]): Meal[] {
  const familyTop = new Map<string, number>()
  for (const m of list) if (m.family) familyTop.set(m.family, Math.max(familyTop.get(m.family) ?? 0, m.cooked))
  const rank = (m: Meal) => (m.family ? familyTop.get(m.family)! : m.cooked)
  const groupName = (m: Meal) => m.family ?? m.name
  return [...list].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      groupName(a).localeCompare(groupName(b)) ||
      b.cooked - a.cooked ||
      a.name.localeCompare(b.name),
  )
}

export function ratingFor(meal: Meal, optionId: string | null, ratedAs: RatedAs): Rating | undefined {
  return meal.ratings.find((r) => (r.optionId ?? null) === optionId && r.ratedAs === ratedAs)
}

/** One thing to rate: the meal itself, one variation, or one combination. */
export interface Rateable {
  key: string | null // null = the meal; option id; or sorted ids joined with '+'
  label: string
}

/**
 * Every variation and every combination of a meal. No options: the meal.
 * One axis: each option. Two axes: every pairing (style first).
 */
export function rateables(meal: Meal): Rateable[] {
  const groups = axes(meal)
  if (groups.length === 0) return [{ key: null, label: meal.name }]
  // Style-like axes read first: "Cajun · Kangaroo".
  groups.sort((a, b) => (a.axis === 'Style' ? -1 : b.axis === 'Style' ? 1 : 0))
  let combos: { ids: string[]; names: string[] }[] = [{ ids: [], names: [] }]
  for (const g of groups) {
    combos = combos.flatMap((c) => g.options.map((o) => ({ ids: [...c.ids, o.id], names: [...c.names, o.name] })))
  }
  return combos.map((c) => ({ key: [...c.ids].sort().join('+'), label: c.names.join(' · ') }))
}

const complete = (r: Rating | undefined): boolean => Boolean(r && r.thumbs !== null && r.stars !== null)

/** Every variation / combination has thumbs and stars from this persona. */
export function isRated(meal: Meal, ratedAs: RatedAs): boolean {
  return rateables(meal).every((x) => complete(ratingFor(meal, x.key, ratedAs)))
}

/** [done, total] variations rated by this persona for one meal. */
export function ratedParts(meal: Meal, ratedAs: RatedAs): [number, number] {
  const all = rateables(meal)
  return [all.filter((x) => complete(ratingFor(meal, x.key, ratedAs))).length, all.length]
}

/** The best rating this persona gave any variation (for list summaries). */
export function bestRating(meal: Meal, ratedAs: RatedAs): Rating | undefined {
  const keys = new Set(rateables(meal).map((x) => x.key))
  return meal.ratings
    .filter((r) => r.ratedAs === ratedAs && keys.has(r.optionId ?? null))
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.thumbs ?? 0) - (a.thumbs ?? 0))[0]
}

/** How many meals this persona has fully rated. */
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
