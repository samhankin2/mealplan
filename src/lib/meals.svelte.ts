import { api } from './api'
import type { Meal, RatedAs, Rating } from './types'
import { onWantList } from './wants.svelte'

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
 * The variations and combinations still on a meal's list: every one, less
 * those we've taken off because we've never had them.
 */
export function rateables(meal: Meal): Rateable[] {
  const hidden = new Set(meal.hidden ?? [])
  return allRateables(meal).filter((x) => x.key === null || !hidden.has(x.key))
}

/** The variations taken off the list, to put back. */
export function hiddenRateables(meal: Meal): Rateable[] {
  const hidden = new Set(meal.hidden ?? [])
  return allRateables(meal).filter((x) => x.key !== null && hidden.has(x.key))
}

/**
 * Every variation and every combination of a meal. No options: the meal.
 * One axis: each option. Two axes: every pairing (style first).
 */
export function allRateables(meal: Meal): Rateable[] {
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

const scored = (r: Rating | undefined): boolean => Boolean(r && r.thumbs !== null && r.stars !== null)
/** Answered: scored by this persona, or on the want-to-make list (haven't had it, want to). */
export const answered = (meal: Meal, key: string | null, ratedAs: RatedAs): boolean =>
  scored(ratingFor(meal, key, ratedAs)) || onWantList(meal.id, key)

/**
 * Done for this persona: every variation / combination on the list is scored
 * (thumbs and stars) or on the want-to-make list, and, once anything has been
 * eaten, the meal has an effort (shared by the household, set on the meal).
 */
export function isRated(meal: Meal, ratedAs: RatedAs): boolean {
  const keys = rateables(meal).map((x) => x.key)
  if (!keys.every((k) => answered(meal, k, ratedAs))) return false
  return meal.effort !== null || !keys.some((k) => scored(ratingFor(meal, k, ratedAs)))
}

/** This persona has answered at least one variation of the meal. */
export function isStarted(meal: Meal, ratedAs: RatedAs): boolean {
  return rateables(meal).some((x) => answered(meal, x.key, ratedAs))
}

/** [done, total] variations rated by this persona for one meal. */
export function ratedParts(meal: Meal, ratedAs: RatedAs): [number, number] {
  const all = rateables(meal)
  return [all.filter((x) => answered(meal, x.key, ratedAs)).length, all.length]
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
  const empty = next.thumbs === null && next.stars === null
  meal.ratings = empty ? others : [...others, { optionId, ratedAs, ...next }]
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
  patch: Partial<Pick<Meal, 'tags' | 'suggestedTags' | 'effort' | 'tips' | 'neverSuggest' | 'regularEveryDays' | 'coverPhotoId'>>,
): Promise<void> {
  const meal = mealById(mealId)
  if (!meal) return
  const before = { ...meal }
  Object.assign(meal, patch)
  try {
    // Take back only what this save is about (plus tip suggestions, which the
    // server recomputes): ratings tapped meanwhile are still in flight and the
    // server's copy may not have them yet.
    const saved = (await api.updateMeal(mealId, patch)).meal
    if (saved) {
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) (meal as unknown as Record<string, unknown>)[k] = saved[k]
      meal.tipSuggestions = saved.tipSuggestions
    }
  } catch (e) {
    Object.assign(meal, before)
    throw e
  }
}

/** Take a variation off the meal's list for the household ("never had it"), or put it back. */
export async function setHidden(mealId: string, key: string, hidden: boolean): Promise<void> {
  const meal = mealById(mealId)
  if (!meal) return
  const before = meal.hidden ?? []
  meal.hidden = hidden ? [...new Set([...before, key])] : before.filter((k) => k !== key)
  try {
    meal.hidden = (await api.setHidden(mealId, key, hidden)).hidden
  } catch (e) {
    meal.hidden = before
    throw e
  }
}

/** Remove a whole meal from the list (history and ratings are kept), or bring it back. */
export async function removeMeal(meal: Meal): Promise<void> {
  const before = meals.list
  meals.list = meals.list.filter((m) => m.id !== meal.id)
  try {
    await api.updateMeal(meal.id, { archived: true })
  } catch (e) {
    meals.list = before
    throw e
  }
}
export async function restoreMeal(meal: Meal): Promise<void> {
  const { meal: saved } = await api.updateMeal(meal.id, { archived: false })
  if (!meals.list.some((m) => m.id === meal.id)) meals.list = [...meals.list, saved ?? meal]
}

export async function addNote(mealId: string, body: string): Promise<void> {
  const meal = mealById(mealId)
  if (!meal) return
  const { note } = await api.addNote(mealId, body)
  meal.notes = [...meal.notes, note]
}
