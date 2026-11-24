import { api } from './api'
import { today } from './dates'
import type { CookReview, FreezerItem, Meal, RatedAs, ReviewEntry } from './types'
import { withOptions } from './format'

/**
 * The review queue: past meal nights still marked planned. Reviewed ones stay
 * in `entries` for this visit (so the page doesn't jump) until reloaded.
 */
export const review = $state({
  entries: [] as ReviewEntry[],
  pending: 0, // still to review, for the badge on the week
  loaded: false,
  error: '',
})

export async function loadReview(): Promise<void> {
  review.error = ''
  try {
    const { entries } = await api.review(today())
    review.entries = entries
    review.pending = entries.length
    review.loaded = true
  } catch (e) {
    review.error = e instanceof Error ? e.message : String(e)
  }
}

function replace(entry: ReviewEntry): void {
  review.entries = review.entries.map((e) => (e.id === entry.id ? entry : e))
  review.pending = review.entries.filter((e) => e.status === 'planned').length
}

export async function updateEntry(id: string, patch: Parameters<typeof api.updateEntry>[1]): Promise<ReviewEntry> {
  const { entry } = await api.updateEntry(id, patch)
  replace(entry)
  return entry
}

export async function reviewCook(id: string, ratedAs: RatedAs, value: { thumbs: -1 | 1 | null; stars: number | null }): Promise<void> {
  const { entry } = await api.setReview(id, { ratedAs, ...value })
  replace(entry)
}

export function opinionOf(entry: ReviewEntry, ratedAs: RatedAs): CookReview | undefined {
  return entry.reviews.find((r) => r.ratedAs === ratedAs)
}

/* ------------------------------------------------------------------ */
/* Freezer                                                             */
/* ------------------------------------------------------------------ */

export const freezer = $state({ items: [] as FreezerItem[], loaded: false, error: '' })

export async function loadFreezer(): Promise<void> {
  freezer.error = ''
  try {
    freezer.items = (await api.freezer()).items
    freezer.loaded = true
  } catch (e) {
    freezer.error = e instanceof Error ? e.message : String(e)
  }
}

export async function setPortions(id: string, portions: number): Promise<void> {
  const { item } = await api.setFreezerPortions(id, portions)
  freezer.items = portions > 0 ? freezer.items.map((f) => (f.id === id ? item : f)) : freezer.items.filter((f) => f.id !== id)
}

export async function addToFreezer(dishId: string, portions: number, optionIds: string[] = []): Promise<void> {
  await api.addFreezer({ dishId, portions, optionIds, frozenOn: today() })
  await loadFreezer()
}

/** "Palak (Paneer)" for a freezer item. */
export function freezerLabel(item: FreezerItem, meals: Meal[]): string {
  const meal = meals.find((m) => m.id === item.dishId)
  const options = meal ? meal.options.filter((o) => item.optionIds.includes(o.id)).map((o) => o.name) : []
  return withOptions(meal?.name ?? 'A meal', options)
}
