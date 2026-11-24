import { api } from './api'
import { today } from './dates'
import { loadMeals } from './meals.svelte'
import type { Day } from './types'

/** Dated cooks and imported weeks: what suggestions need beyond the meals list. */
export const history = $state({
  entries: [] as { dishId: string; date: Day }[],
  importedWeeks: 0,
  loaded: false,
})

export async function loadHistory(): Promise<void> {
  try {
    const h = await api.history()
    history.entries = h.entries
    history.importedWeeks = h.importedWeeks
    history.loaded = true
  } catch {
    // Suggestions still work from the meals list alone.
  }
}

/** "Not now": out of suggestions for three weeks, on both phones. */
export async function notNow(mealId: string): Promise<void> {
  await api.snooze(mealId, today(), 21)
  await loadMeals(true)
}
