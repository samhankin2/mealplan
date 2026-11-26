import { api } from './api'
import type { Meal, WantLevel, WantLine } from './types'

/** The want-to-make scratch pad, shared by the household. */
export const wants = $state({
  list: [] as WantLine[],
  loaded: false,
  error: '',
  matching: {} as Record<string, boolean>, // the AI is looking for the meal
  guesses: {} as Record<string, { dishId: string; name: string }[]>, // "did you mean" when it couldn't decide
})

export const LEVELS: { level: WantLevel; label: string }[] = [
  { level: 1, label: 'Some day' },
  { level: 2, label: 'Keen' },
  { level: 3, label: 'Really want' },
]
export const levelLabel = (l: WantLevel): string => LEVELS.find((x) => x.level === l)?.label ?? 'Keen'

let loading: Promise<void> | null = null
export function loadWants(force = false): Promise<void> {
  if (wants.loaded && !force) return Promise.resolve()
  loading ??= api
    .wants()
    .then((r) => {
      wants.list = r.wants
      wants.loaded = true
      wants.error = ''
    })
    .catch((e) => {
      wants.error = e instanceof Error ? e.message : String(e)
    })
    .finally(() => (loading = null))
  return loading
}

function put(w: WantLine): void {
  const i = wants.list.findIndex((x) => x.id === w.id)
  if (w.done) {
    if (i >= 0) wants.list.splice(i, 1)
  } else if (i >= 0) wants.list[i] = w
  else wants.list.push(w)
}

async function matchInBackground(id: string): Promise<void> {
  wants.matching[id] = true
  delete wants.guesses[id]
  try {
    const r = await api.matchWant(id)
    put(r.want)
    if (!r.matched) wants.guesses[id] = r.candidates.filter((c) => c.confidence > 0).slice(0, 2)
  } catch {
    // Not matched is fine: the words are the want.
  } finally {
    delete wants.matching[id]
  }
}

/** One or more lines (a paste splits on new lines). Saved at once; the meal is found behind. */
export async function addWants(text: string, level: WantLevel): Promise<void> {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    const { want, pending } = await api.addWant(line, level)
    put(want)
    if (pending) void matchInBackground(want.id)
  }
}

export async function setWantText(id: string, text: string): Promise<void> {
  delete wants.guesses[id]
  const { want, pending } = await api.updateWant(id, { text })
  put(want)
  if (pending) void matchInBackground(id)
}

export async function setWantLevel(id: string, level: WantLevel): Promise<void> {
  const w = wants.list.find((x) => x.id === id)
  const was = w?.level
  if (w) w.level = level // answer the tap straight away
  try {
    put((await api.updateWant(id, { level })).want)
  } catch (e) {
    if (w && was) w.level = was
    throw e
  }
}

/** "Did you mean" / "Not this": point the words at a meal, or none. */
export async function linkWant(id: string, dishId: string | null, optionIds: string[] = []): Promise<void> {
  delete wants.guesses[id]
  put((await api.updateWant(id, { dishId, optionIds })).want)
}

export async function tickWant(id: string): Promise<void> {
  put((await api.updateWant(id, { done: true })).want)
}

export async function removeWant(id: string): Promise<void> {
  await api.removeWant(id)
  const i = wants.list.findIndex((x) => x.id === id)
  if (i >= 0) wants.list.splice(i, 1)
}

/* ------------------------------------------------------------------ */
/* From the rating rows: "Haven't had it, want to make"                 */
/* ------------------------------------------------------------------ */

/**
 * Open lines that put this variation on the list. `key` is a rating row's:
 * null for a meal with no options, else option ids joined with '+'. A line
 * naming some of the row's options counts ("Korean" covers Korean · Beef);
 * a line for the whole meal counts only on a meal with no options.
 */
export function linesFor(dishId: string, key: string | null): WantLine[] {
  const ids = key ? key.split('+') : []
  return wants.list.filter(
    (w) => w.dishId === dishId && !w.done && (key === null ? w.optionIds.length === 0 : w.optionIds.length > 0 && w.optionIds.every((o) => ids.includes(o))),
  )
}
export const onWantList = (dishId: string, key: string | null): boolean => linesFor(dishId, key).length > 0

/** Put a meal or variation on the list (keen), named as it reads: "Dirty cabbage (Korean, Beef)". */
export async function wantVariation(meal: Meal, key: string | null, label: string): Promise<void> {
  const text = key === null ? meal.name : `${meal.name} (${label.split(' · ').join(', ')})`
  const { want } = await api.addWant(text, 2, { dishId: meal.id, optionIds: key ? key.split('+') : [] })
  put(want)
}

/** Take a variation off the list: every line that put it there. */
export async function unwantVariation(dishId: string, key: string | null): Promise<void> {
  for (const w of linesFor(dishId, key)) await removeWant(w.id)
}
