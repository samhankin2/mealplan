/**
 * Suggestions (M4). Pure functions: meals + history in, ranked lanes out.
 * Imports types only, so qa/suggest-test.mjs can run it in plain Node.
 *
 * Lanes: due regulars, forgotten favourites, from the freezer, this time last
 * year, rediscover, picks (one of us loves it), want to try, weekend projects.
 */
import type { Day, FreezerItem, Meal, Member, PlanEntry, Rating } from './types'

export type Lane = 'regular' | 'forgotten' | 'freezer' | 'lastYear' | 'rediscover' | 'pick' | 'want' | 'weekend'

export interface Suggestion {
  lane: Lane
  mealId: string
  title: string // "Dirty cabbage" or "Dirty cabbage · Korean · Beef" (best variation)
  reason: string // why it's here, shown under the title
  score: number // higher first within a lane
  freezerItemId?: string
  optionIds?: string[] // the best-rated variation, to plan it as that
}

export interface SuggestInput {
  meals: Meal[]
  history: { entries: { dishId: string; date: Day }[]; importedWeeks: number }
  freezer: FreezerItem[]
  members: Member[]
  today: Day
  planned: PlanEntry[] // nights already planned around now: those meals aren't suggested again
}

export const LANE_TITLES: Record<Lane, string> = {
  regular: 'Due regulars',
  forgotten: 'Forgotten favourites',
  freezer: 'From the freezer',
  lastYear: 'This time last year',
  rediscover: 'Rediscover',
  pick: 'One of us loves it',
  want: 'Want to try',
  weekend: 'Weekend project',
}

/** Lane order in the tray and for picking a night's top three. */
export const LANE_ORDER: Lane[] = ['regular', 'freezer', 'forgotten', 'pick', 'lastYear', 'want', 'rediscover', 'weekend']

/** The weekly forgotten threshold (5 weeks). */
export const FORGOTTEN_DAYS = 35

const DISH_TYPES = ['pasta', 'curry', 'soup', 'stew', 'rice', 'noodles', 'salad', 'bowl', 'tacos', 'burger', 'pie', 'roast', 'traybake', 'stir-fry']
const VEG_OPTIONS = new Set(['veg', 'tofu', 'paneer', 'halloumi', 'lentil', 'vegetarian', 'vegan'])

const DAY_MS = 86_400_000
const dayNum = (d: Day) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY_MS
export const daysBetween = (a: Day, b: Day) => Math.round(dayNum(b) - dayNum(a))
const addDays = (d: Day, n: number): Day => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10)
const weeks = (days: number) => (days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} days`)

/* ------------------------------------------------------------------ */
/* What we think of a meal                                              */
/* ------------------------------------------------------------------ */

const scored = (r: Rating) => !r.want && (r.thumbs !== null || r.stars !== null)

export interface Opinion {
  liked: boolean // someone gave it thumbs up and it isn't mostly thumbs down
  disliked: boolean // every opinion is thumbs down
  stars: number | null // best stars on any variation
  best: Rating | undefined // the best-rated variation
  wanted: boolean // "want to make" on any variation
  rated: boolean
}

export function opinionOf(meal: Meal): Opinion {
  const hidden = new Set(meal.hidden ?? [])
  const rs = meal.ratings.filter((r) => !(r.optionId && hidden.has(r.optionId)))
  const s = rs.filter(scored)
  const ups = s.filter((r) => r.thumbs === 1 || (r.thumbs === null && (r.stars ?? 0) >= 3)).length
  const downs = s.filter((r) => r.thumbs === -1 || (r.thumbs === null && (r.stars ?? 5) <= 2)).length
  const best = [...s].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.thumbs ?? 0) - (a.thumbs ?? 0))[0]
  return {
    liked: ups > 0 && ups >= downs,
    disliked: s.length > 0 && ups === 0,
    stars: best?.stars ?? null,
    best,
    wanted: rs.some((r) => r.want),
    rated: s.length > 0,
  }
}

/** "Dirty cabbage · Korean · Beef" for the best-rated variation. */
function titleOf(meal: Meal, best: Rating | undefined): { title: string; optionIds: string[] } {
  const ids = best?.optionId ? best.optionId.split('+') : []
  // Style reads first, as on the rating screen: "Cajun · Kangaroo".
  const names = meal.options
    .filter((o) => ids.includes(o.id))
    .sort((a, b) => (a.axis === 'Style' ? -1 : b.axis === 'Style' ? 1 : 0))
    .map((o) => o.name)
  return { title: [meal.name, ...names].join(' · '), optionIds: ids }
}

/* ------------------------------------------------------------------ */
/* When we last made it, and how often                                  */
/* ------------------------------------------------------------------ */

interface Timing {
  daysSince: number // Infinity: never made
  undated: boolean // only in the Notes import, so "since" is a guess
  cadence: number | null // typical days between makes
}

function timingOf(meal: Meal, dated: Day[], importedWeeks: number, today: Day): Timing {
  if (meal.lastCooked) {
    const gaps = dated.slice(1).map((d, i) => daysBetween(dated[i], d)).filter((g) => g > 0)
    const cadence = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : importedWeeks && meal.cooked ? (importedWeeks * 7) / meal.cooked : null
    return { daysSince: daysBetween(meal.lastCooked, today), undated: false, cadence }
  }
  if (meal.cooked > 0) {
    // Only from the Notes: no date, but older than anything planned in the app.
    const cadence = importedWeeks ? Math.min(180, Math.max(7, (importedWeeks * 7) / meal.cooked)) : null
    return { daysSince: 60, undated: true, cadence }
  }
  return { daysSince: Infinity, undated: false, cadence: null }
}

/**
 * A regular: set on the meal, or proposed when the Notes show it made at
 * least 6 times and roughly every three weeks or more often.
 */
export function regularOf(meal: Meal, timing: Timing): { every: number; auto: boolean } | null {
  if (meal.regularEveryDays) return { every: meal.regularEveryDays, auto: false }
  if (meal.cooked >= 6 && timing.cadence && timing.cadence <= 21) {
    return { every: Math.max(7, Math.round(timing.cadence / 7) * 7), auto: true }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Lanes                                                                */
/* ------------------------------------------------------------------ */

export function suggestAll(input: SuggestInput): Suggestion[] {
  const { meals, history, freezer, members, today } = input
  const plannedIds = new Set(input.planned.filter((e) => e.dishId).map((e) => e.dishId!))
  const datedBy = new Map<string, Day[]>()
  for (const e of history.entries) datedBy.set(e.dishId, [...(datedBy.get(e.dishId) ?? []), e.date])
  const lastYear = new Set(
    history.entries.filter((e) => Math.abs(daysBetween(addDays(today, -365), e.date)) <= 14).map((e) => e.dishId),
  )

  const out: Suggestion[] = []
  for (const meal of meals) {
    if (meal.neverSuggest || (meal.snoozedUntil && meal.snoozedUntil >= today) || plannedIds.has(meal.id)) continue
    const op = opinionOf(meal)
    if (op.disliked) continue
    const t = timingOf(meal, (datedBy.get(meal.id) ?? []).sort(), history.importedWeeks, today)
    const { title, optionIds } = titleOf(meal, op.best)
    const add = (lane: Lane, reason: string, score: number) => out.push({ lane, mealId: meal.id, title, reason, score, optionIds })
    const starText = op.stars ? `★${op.stars}` : 'Liked'
    const since = t.undated ? 'not since your Notes' : t.daysSince === Infinity ? 'never made' : `last made ${weeks(t.daysSince)} ago`

    const regular = regularOf(meal, t)
    if (regular) {
      if (t.daysSince >= regular.every) {
        const every = regular.every % 7 === 0 ? `Every ${regular.every === 7 ? 'week' : `${regular.every / 7} weeks`}` : `Every ${regular.every} days`
        add('regular', `${regular.auto ? 'Looks like a regular' : every} · ${since}`, Math.min(t.daysSince / regular.every, 4) + (op.stars ?? 3) / 5)
      }
      continue // a regular keeps its rhythm; it's never "forgotten"
    }

    if (op.liked && t.daysSince >= FORGOTTEN_DAYS && t.daysSince !== Infinity) {
      const overdue = t.cadence ? Math.min(t.daysSince / t.cadence, 3) : 1.5
      add('forgotten', `${starText} · ${since}`, (op.stars ?? 4) * overdue)
    }
    if (lastYear.has(meal.id) && t.daysSince > 21) add('lastYear', `You had this around now last year`, op.stars ?? 3)
    if (!op.rated && meal.cooked >= 3 && t.daysSince >= FORGOTTEN_DAYS) add('rediscover', `Made ${meal.cooked} times · ${since}`, meal.cooked)
    if (op.wanted || (meal.cooked === 0 && op.liked)) add('want', op.wanted ? 'You said you want to make this' : `${starText} · not made yet`, (op.stars ?? 3) + (op.wanted ? 1 : 0))
    if (meal.effort === 3 && op.liked && (op.stars ?? 0) >= 4 && t.daysSince >= 21) add('weekend', `${starText} · worth the effort`, op.stars ?? 4)

    // One of us loves it, the other is lukewarm.
    if (members.length >= 2) {
      const best = (id: string) => Math.max(0, ...meal.ratings.filter((r) => r.ratedAs === id && scored(r)).map((r) => r.stars ?? 0))
      const [a, b] = members.map((m) => ({ m, s: best(m.id) }))
      const fan = a.s >= 4 && b.s && b.s <= 3 ? a : b.s >= 4 && a.s && a.s <= 3 ? b : null
      const other = fan === a ? b : a
      if (fan && t.daysSince >= 21) add('pick', `${fan.m.name}'s pick · ★${fan.s} vs ★${other.s}`, fan.s - other.s)
    }
  }

  for (const item of freezer) {
    const meal = meals.find((m) => m.id === item.dishId)
    if (!meal || item.portions <= 0) continue
    const names = meal.options.filter((o) => item.optionIds.includes(o.id)).map((o) => o.name)
    const age = item.frozenOn ? daysBetween(item.frozenOn, today) : 0
    out.push({
      lane: 'freezer',
      mealId: meal.id,
      title: [meal.name, ...names].join(' · '),
      reason: `×${item.portions}${item.frozenOn ? ` · frozen ${weeks(age)} ago` : ''}`,
      score: age, // oldest first
      freezerItemId: item.id,
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* The tray, and a night's top three                                    */
/* ------------------------------------------------------------------ */

const typeOf = (meal: Meal | undefined) => meal?.tags.concat(meal.suggestedTags).map((t) => t.toLowerCase()).find((t) => DISH_TYPES.includes(t)) ?? null

/** A weeknight (Mon–Thu) gets no high-effort meals; Fri–Sun can have anything. */
export function fitsNight(s: Suggestion, meal: Meal | undefined, date: Day | null): boolean {
  if (!date || s.lane === 'freezer') return true
  const weekday = (new Date(dayNum(date) * DAY_MS).getUTCDay() + 6) % 7 // 0 = Monday
  const weekend = weekday >= 4
  if (s.lane === 'weekend') return weekend
  return weekend || (meal?.effort ?? 2) < 3
}

/**
 * Lanes for the tray, at most `perLane` each, a meal shown once, and at most
 * one of each dish type (no three curries).
 */
export function tray(all: Suggestion[], meals: Meal[], perLane = 3): { lane: Lane; title: string; items: Suggestion[] }[] {
  const seenMeals = new Set<string>()
  const seenTypes = new Set<string>()
  const lanes: { lane: Lane; title: string; items: Suggestion[] }[] = []
  for (const lane of LANE_ORDER) {
    const items: Suggestion[] = []
    for (const s of all.filter((x) => x.lane === lane).sort((a, b) => b.score - a.score)) {
      if (items.length >= perLane) break
      if (seenMeals.has(s.mealId)) continue
      const type = typeOf(meals.find((m) => m.id === s.mealId))
      if (type && seenTypes.has(type) && lane !== 'freezer') continue
      items.push(s)
      seenMeals.add(s.mealId)
      if (type) seenTypes.add(type)
    }
    if (items.length) lanes.push({ lane, title: LANE_TITLES[lane], items })
  }
  return lanes
}

/** The best few for one night: lane order first, then score, fitted to the night. */
export function forNight(all: Suggestion[], meals: Meal[], date: Day, limit = 3): Suggestion[] {
  const out: Suggestion[] = []
  const seen = new Set<string>()
  for (const lane of LANE_ORDER) {
    for (const s of all.filter((x) => x.lane === lane).sort((a, b) => b.score - a.score)) {
      if (out.length >= limit) return out
      if (seen.has(s.mealId) || !fitsNight(s, meals.find((m) => m.id === s.mealId), date)) continue
      out.push(s)
      seen.add(s.mealId)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Week balance                                                         */
/* ------------------------------------------------------------------ */

export interface Balance {
  veggie: number
  fresh: number // meals not made before
  repeats: string[] // meal names planned twice
}

export function weekBalance(entries: PlanEntry[], meals: Meal[]): Balance {
  const byId = new Map(meals.map((m) => [m.id, m]))
  const dinners = entries.filter((e) => (e.kind === 'dish' || e.kind === 'freezer') && e.dishId)
  let veggie = 0
  let fresh = 0
  const counts = new Map<string, number>()
  for (const e of dinners) {
    const meal = byId.get(e.dishId!)
    if (!meal) continue
    counts.set(meal.id, (counts.get(meal.id) ?? 0) + 1)
    const tags = meal.tags.concat(meal.suggestedTags).map((t) => t.toLowerCase())
    const options = meal.options.filter((o) => e.optionIds.includes(o.id)).map((o) => o.name.toLowerCase())
    if (tags.includes('vegetarian') || tags.includes('vegan') || options.some((o) => VEG_OPTIONS.has(o))) veggie++
    if (meal.cooked === 0) fresh++
  }
  const repeats = [...counts].filter(([, n]) => n > 1).map(([id]) => byId.get(id)!.name)
  return { veggie, fresh, repeats }
}
