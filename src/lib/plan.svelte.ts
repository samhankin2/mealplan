import { api } from './api'
import type { Day, Meal, NightKind, PlanEntry } from './types'

/** Weeks we've loaded, by start date. Refreshed when the app comes back into view. */
export const plan = $state({
  weeks: {} as Record<Day, PlanEntry[]>,
  loading: false,
  error: '',
})

let current: Day | null = null
const lengths: Record<Day, number> = {} // how many nights each loaded run holds

export async function loadWeek(start: Day, days = lengths[start] ?? 7): Promise<void> {
  current = start
  lengths[start] = days
  plan.loading = true
  plan.error = ''
  try {
    const { week } = await api.week(start, { days })
    plan.weeks[start] = week.entries
  } catch (e) {
    plan.error = e instanceof Error ? e.message : String(e)
  } finally {
    plan.loading = false
  }
}

// Two phones, one plan: pick up the other person's changes when we come back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current) void loadWeek(current)
  })
}

export function entryFor(start: Day, date: Day): PlanEntry | undefined {
  return plan.weeks[start]?.find((e) => e.date === date)
}

/** Put a night the server sent back into its week (null: the night is now empty). */
export function putNight(start: Day, date: Day, entry: PlanEntry | null): void {
  if (entry) put(start, entry)
  else plan.weeks[start] = (plan.weeks[start] ?? []).filter((e) => e.date !== date)
}

function put(start: Day, entry: PlanEntry): void {
  const list = (plan.weeks[start] ?? []).filter((e) => e.date !== entry.date)
  plan.weeks[start] = [...list, entry].sort((a, b) => a.date.localeCompare(b.date))
}

export async function setNight(
  start: Day,
  date: Day,
  body: { kind: NightKind; dishId?: string | null; optionIds?: string[]; note?: string | null; raw?: string | null; freezerItemId?: string },
): Promise<PlanEntry> {
  const { entry } = await api.setNight(date, body)
  put(start, entry)
  return entry
}

export async function clearNight(start: Day, date: Day): Promise<void> {
  await api.clearNight(date)
  plan.weeks[start] = (plan.weeks[start] ?? []).filter((e) => e.date !== date)
}

/**
 * Drag and drop: move a night onto another (an empty night: moved; a planned
 * one: swapped). Shown at once, put right from the server either way.
 */
export async function moveNight(start: Day, from: Day, to: Day): Promise<void> {
  if (from === to) return
  const list = plan.weeks[start] ?? []
  plan.weeks[start] = list
    .map((e) => (e.date === from ? { ...e, date: to } : e.date === to ? { ...e, date: from } : e))
    .sort((a, b) => a.date.localeCompare(b.date))
  try {
    await api.moveNight(from, to)
  } finally {
    await loadWeek(start)
  }
}

export async function copyWeek(from: Day, to: Day): Promise<number> {
  const { copied, week } = await api.copyWeek(from, to)
  plan.weeks[to] = week.entries
  return copied
}

/* ------------------------------------------------------------------ */
/* Finding a meal as you type                                           */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Meals matching typed text, best first: name starts with it, then a word in
 * the name starts with it, then any match in the name or an alias. Ties go to
 * the meal we make most. Empty text: the most made.
 */
export function searchMeals(list: Meal[], text: string, limit = 8): Meal[] {
  const q = norm(text)
  if (!q) return [...list].sort((a, b) => b.cooked - a.cooked || a.name.localeCompare(b.name)).slice(0, limit)
  const scored: { meal: Meal; score: number }[] = []
  for (const meal of list) {
    const name = norm(meal.name)
    let score = 0
    if (name === q) score = 100
    else if (name.startsWith(q)) score = 80
    else if (name.split(' ').some((w) => w.startsWith(q))) score = 60
    else if (name.includes(q)) score = 40
    else if (meal.aliases.some((a) => a === q)) score = 70
    else if (meal.aliases.some((a) => a.includes(q))) score = 30
    if (score) scored.push({ meal, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.meal.cooked - a.meal.cooked || a.meal.name.localeCompare(b.meal.name))
    .slice(0, limit)
    .map((s) => s.meal)
}

/** Title and detail for a planned night: "Dirty cabbage" / "Korean, Beef". */
export function describe(entry: PlanEntry, meals: Meal[]): { title: string; detail: string } {
  if (entry.kind === 'out') return { title: 'Out', detail: entry.note ?? '' }
  if (entry.kind === 'leftovers') return { title: 'Leftovers', detail: entry.note ?? '' }
  if (entry.kind === 'takeaway') return { title: 'Takeaway', detail: entry.note ?? '' }
  const meal = meals.find((m) => m.id === entry.dishId)
  const options = meal ? meal.options.filter((o) => entry.optionIds.includes(o.id)).map((o) => o.name) : []
  const first = [entry.kind === 'freezer' ? 'From the freezer' : '', options.join(', ')].filter(Boolean).join(', ')
  return { title: meal?.name ?? entry.raw ?? 'A meal', detail: [first, entry.note].filter(Boolean).join(' — ') }
}
