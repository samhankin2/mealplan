/**
 * Suggestions (M4). Pure functions: meals + history in, ranked lanes out.
 * Imports types only, so qa/suggest-test.mjs can run it in plain Node.
 *
 * Lanes: due regulars, forgotten favourites, from the freezer, this time last
 * year, rediscover, picks (one of us loves it), want to try, weekend projects.
 */
import type { Day, FreezerItem, Meal, Member, PlanEntry, Rating } from './types'
import { stars as starWords, withOptions } from './format.ts'

export type Lane = 'regular' | 'forgotten' | 'freezer' | 'lastYear' | 'rediscover' | 'pick' | 'want' | 'weekend'

export interface Suggestion {
  lane: Lane
  mealId: string
  title: string // "Dirty cabbage" or "Dirty cabbage (Korean, Beef)" (best variation)
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

/**
 * How much a rating counts, in stars. Most ratings so far were given from
 * memory when the meals were imported, so they're pulled halfway to 3 (a
 * remembered 5 counts as 4); a rating given after actually cooking it counts
 * in full. Thumbs alone count as 4 or 1.5.
 */
export const MEMORY_WEIGHT = 0.5
export function ratingWeight(r: Pick<Rating, 'stars' | 'thumbs' | 'source'>): number | null {
  const raw = r.stars ?? (r.thumbs === 1 ? 4 : r.thumbs === -1 ? 1.5 : null)
  if (raw === null) return null
  return r.source === 'review' ? raw : 3 + (raw - 3) * MEMORY_WEIGHT
}
const fromCooking = (r: Rating) => r.source === 'review'

export interface Opinion {
  liked: boolean // someone gave it thumbs up and it isn't mostly thumbs down
  disliked: boolean // every opinion is thumbs down
  stars: number | null // best stars on any variation
  best: Rating | undefined // the best-rated variation
  wanted: boolean // "want to make" on any variation
  want: Rating | undefined // the variation we want to make
  rated: boolean
}

export function opinionOf(meal: Meal): Opinion {
  const hidden = new Set(meal.hidden ?? [])
  const rs = meal.ratings.filter((r) => !(r.optionId && hidden.has(r.optionId)))
  const s = rs.filter(scored)
  const ups = s.filter((r) => r.thumbs === 1 || (r.thumbs === null && (r.stars ?? 0) >= 3)).length
  const downs = s.filter((r) => r.thumbs === -1 || (r.thumbs === null && (r.stars ?? 5) <= 2)).length
  const best = [...s].sort((a, b) => (ratingWeight(b) ?? 0) - (ratingWeight(a) ?? 0) || Number(fromCooking(b)) - Number(fromCooking(a)) || (b.stars ?? 0) - (a.stars ?? 0))[0]
  return {
    liked: ups > 0 && ups >= downs,
    disliked: s.length > 0 && ups === 0,
    stars: best?.stars ?? null,
    best,
    wanted: rs.some((r) => r.want),
    want: rs.find((r) => r.want),
    rated: s.length > 0,
  }
}

/** "Dirty cabbage (Korean, Beef)" for the best-rated variation. */
function titleOf(meal: Meal, best: Rating | undefined): { title: string; optionIds: string[] } {
  const ids = best?.optionId ? best.optionId.split('+') : []
  // Style reads first, as on the rating screen: "Cajun, Kangaroo".
  const names = meal.options
    .filter((o) => ids.includes(o.id))
    .sort((a, b) => (a.axis === 'Style' ? -1 : b.axis === 'Style' ? 1 : 0))
    .map((o) => o.name)
  return { title: withOptions(meal.name, names), optionIds: ids }
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
    const add = (lane: Lane, reason: string, score: number, as = { title, optionIds }) => out.push({ lane, mealId: meal.id, reason, score, ...as })
    const starText = op.stars ? starWords(op.stars) : 'Liked'
    const since = t.undated ? 'not since your Notes' : t.daysSince === Infinity ? 'never made' : `last made ${weeks(t.daysSince)} ago`

    const regular = regularOf(meal, t)
    if (regular) {
      if (t.daysSince >= regular.every) {
        const every = regular.every % 7 === 0 ? `Every ${regular.every === 7 ? 'week' : `${regular.every / 7} weeks`}` : `Every ${regular.every} days`
        add('regular', `${regular.auto ? 'Looks like a regular' : every}, ${since}`, Math.min(t.daysSince / regular.every, 4) + (op.stars ?? 3) / 5)
      }
      continue // a regular keeps its rhythm; it's never "forgotten"
    }

    if (op.liked && t.daysSince >= FORGOTTEN_DAYS && t.daysSince !== Infinity) {
      const overdue = t.cadence ? Math.min(t.daysSince / t.cadence, 3) : 1.5
      add('forgotten', `${starText}, ${since}`, (op.stars ?? 4) * overdue)
    }
    if (lastYear.has(meal.id) && t.daysSince > 21) add('lastYear', `You had this around now last year`, op.stars ?? 3)
    if (!op.rated && meal.cooked >= 3 && t.daysSince >= FORGOTTEN_DAYS) add('rediscover', `Made ${meal.cooked} times, ${since}`, meal.cooked)
    // Named as the variation we said we want, not the best-rated one we've already had.
    if (op.wanted) add('want', 'You said you want to make this', (op.stars ?? 3) + 1, titleOf(meal, op.want))
    else if (meal.cooked === 0 && op.liked) add('want', `${starText}, not made yet`, op.stars ?? 3)
    if (meal.effort === 3 && op.liked && (op.stars ?? 0) >= 4 && t.daysSince >= 21) add('weekend', `${starText}, worth the effort`, op.stars ?? 4)

    // One of us loves it, the other is lukewarm.
    if (members.length >= 2) {
      const best = (id: string) => Math.max(0, ...meal.ratings.filter((r) => r.ratedAs === id && scored(r)).map((r) => r.stars ?? 0))
      const [a, b] = members.map((m) => ({ m, s: best(m.id) }))
      const fan = a.s >= 4 && b.s && b.s <= 3 ? a : b.s >= 4 && a.s && a.s <= 3 ? b : null
      const other = fan === a ? b : a
      if (fan && t.daysSince >= 21) add('pick', `${fan.m.name}'s pick: ${starWords(fan.s)} against ${other.s}`, fan.s - other.s)
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
      title: withOptions(meal.name, names),
      reason: `${item.portions} portion${item.portions === 1 ? '' : 's'}${item.frozenOn ? `, frozen ${weeks(age)} ago` : ''}`,
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

/* ------------------------------------------------------------------ */
/* Ideas: one score per meal, with everything behind it                 */
/* ------------------------------------------------------------------ */

const PROTEINS = ['chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'prawn', 'kangaroo', 'tofu', 'turkey', 'duck', 'sausage', 'mince', 'egg', 'paneer', 'halloumi', 'lentil', 'chickpea', 'bean']

export interface PersonView {
  name: string
  stars: number | null
  thumbs: -1 | 1 | null
  estimate: boolean // rated from memory, not a real cook
  wants: boolean
}

export interface Idea {
  mealId: string
  title: string // the best variation: "Dirty cabbage (Korean, Beef)"
  optionIds: string[]
  score: number
  headline: string // the main reason, in a sentence
  facts: string[] // everything else worth knowing
  people: PersonView[]
  made: number
  lastMade: Day | null
  undated: boolean // made, but only in the Notes import
  everyDays: number | null // typical days between makes
  daysSince: number | null
  overdue: boolean
  bothLike: boolean
  oneSided: boolean
  wanted: boolean
  isNew: boolean // never made
  veggie: boolean
  effort: 1 | 2 | 3 | null
  tags: string[]
  protein: string | null
  type: string | null
  freezerItemId?: string
  frozenPortions?: number
}

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase())
const proteinIn = (words: string[]) => PROTEINS.find((p) => words.some((w) => w === p || w.startsWith(p) || w.includes(` ${p}`))) ?? null
const roughly = (days: number) => (days < 10 ? `${days} days` : days < 60 ? `${Math.round(days / 7)} weeks` : `${Math.round(days / 30)} months`)

/** What a planned meal brings to the week: its type, protein and whether it's veggie. */
function traitsOf(meal: Meal, optionIds: string[]) {
  const tags = lower(meal.tags.concat(meal.suggestedTags))
  const options = lower(meal.options.filter((o) => optionIds.includes(o.id)).map((o) => o.name))
  const words = [...options, ...tags, ...lower(meal.name.split(/\s+/))]
  const veggie = tags.includes('vegetarian') || tags.includes('vegan') || options.some((o) => VEG_OPTIONS.has(o))
  return { type: typeOf(meal), protein: veggie ? 'veg' : proteinIn(words), veggie, tags }
}

/**
 * Every meal worth suggesting, best first, for a week. The score is mostly
 * how much we both like it, how overdue it is against how often we have it,
 * and how it fits what's already planned; picks are spread so the top isn't
 * three curries.
 */
export function rankIdeas(input: SuggestInput): Idea[] {
  const { meals, history, freezer, members, today } = input
  const byId = new Map(meals.map((m) => [m.id, m]))
  const planned = input.planned.filter((e) => (e.kind === 'dish' || e.kind === 'freezer') && e.dishId && byId.has(e.dishId))
  const plannedIds = new Set(planned.map((e) => e.dishId!))
  const week = planned.map((e) => traitsOf(byId.get(e.dishId!)!, e.optionIds))
  const weekTypes = new Set(week.map((w) => w.type).filter(Boolean))
  const weekProteins = new Set(week.map((w) => w.protein).filter(Boolean))
  const weekHasVeggie = week.some((w) => w.veggie)
  const datedBy = new Map<string, Day[]>()
  for (const e of history.entries) datedBy.set(e.dishId, [...(datedBy.get(e.dishId) ?? []), e.date])
  const people = members.length ? members : [{ id: 'both', name: 'You', me: true }]

  const ideas: Idea[] = []
  for (const meal of meals) {
    if (meal.neverSuggest || (meal.snoozedUntil && meal.snoozedUntil >= today) || plannedIds.has(meal.id)) continue
    const hidden = new Set(meal.hidden ?? [])
    const ratings = meal.ratings.filter((r) => !(r.optionId && hidden.has(r.optionId)))
    const op = opinionOf(meal)
    const t = timingOf(meal, (datedBy.get(meal.id) ?? []).sort(), history.importedWeeks, today)

    // Each of us: our best rating on any variation ("both" counts for each).
    const view: PersonView[] = people.map((m) => {
      const mine = ratings.filter((r) => r.ratedAs === m.id || r.ratedAs === 'both')
      const byStars = (a: Rating, b: Rating) => (b.stars ?? 0) - (a.stars ?? 0) || (b.thumbs ?? 0) - (a.thumbs ?? 0)
      const scoredMine = mine.filter(scored)
      const best = scoredMine.filter(fromCooking).sort(byStars)[0] ?? scoredMine.sort(byStars)[0]
      return { name: m.name, stars: best?.stars ?? null, thumbs: best?.thumbs ?? null, estimate: Boolean(best) && !fromCooking(best), wants: mine.some((r) => r.want) }
    })
    // As given, for the words ("you both love it"); weighted, for the score.
    const level = (p: PersonView) => p.stars ?? (p.thumbs === 1 ? 4 : p.thumbs === -1 ? 1.5 : null)
    const levels = view.map(level)
    const weighted = view.map((p) => ratingWeight({ stars: p.stars, thumbs: p.thumbs, source: p.estimate ? 'estimate' : 'review' }))
    const wKnown = weighted.filter((l): l is number => l !== null)
    const realShare = view.filter((p, i) => levels[i] !== null && !p.estimate).length / view.length
    const known = levels.filter((l): l is number => l !== null)
    if (known.length && known.every((l) => l <= 2)) continue // neither of us likes it
    const lo = known.length ? Math.min(...known) : null
    const hi = known.length ? Math.max(...known) : null
    const bothLike = known.length === view.length && view.length > 1 && lo !== null && lo >= 4
    const oneSided = view.length > 1 && hi !== null && hi >= 4 && (known.length < view.length || (lo !== null && lo <= 3))
    const wanters = view.filter((p) => p.wants)

    // How much we like it, -1..1: the lower of our ratings counts double, so "both like it" wins.
    let like = 0
    if (wKnown.length) like = ((Math.min(...wKnown) * 2 + Math.max(...wKnown)) / 3 - 3) / 2
    like += 0.15 * realShare // known from real cooks, not just remembered
    if (known.length && known.length < view.length) like *= 0.7 // only one of us has rated it
    if (!known.length) like = meal.cooked >= 3 ? 0.1 : 0

    // How overdue, 0..1, against how often we have it.
    // A rhythm only once there's enough to go on: three makes, at least a week apart.
    const everyDays = regularOf(meal, t)?.every ?? (t.cadence && meal.cooked >= 3 && t.cadence >= 7 ? Math.round(t.cadence) : null)
    const finite = t.daysSince !== Infinity
    let due = 0
    if (finite && everyDays) due = Math.max(0, Math.min(1, (t.daysSince / everyDays - 0.8) / 1.5))
    else if (finite && t.daysSince >= FORGOTTEN_DAYS) due = 0.5
    if (t.undated) due = Math.min(due, 0.5) // a guess: it's only in the Notes
    const tooSoon = finite && !t.undated && t.daysSince < 14
    const overdue = due >= 0.4 && !tooSoon

    const { title, optionIds } = titleOf(meal, op.want && !known.length ? op.want : op.best)
    const traits = traitsOf(meal, optionIds)
    const item = freezer.filter((f) => f.dishId === meal.id && f.portions > 0).sort((a, b) => (a.frozenOn ?? '').localeCompare(b.frozenOn ?? ''))[0]

    let score = like * 1.0 + due * 0.8
    if (tooSoon) score -= 0.6
    if (traits.type && weekTypes.has(traits.type)) score -= 0.5
    if (traits.protein && traits.protein !== 'veg' && weekProteins.has(traits.protein)) score -= 0.3
    if (traits.veggie && !weekHasVeggie && planned.length) score += 0.25
    if (item) score += 0.3
    if (wanters.length) score += wanters.length > 1 ? 0.4 : 0.25
    if (meal.cooked === 0 && !wanters.length && !known.length) score -= 0.3

    // In words.
    const facts: string[] = []
    const rated = view.filter((_, i) => levels[i] !== null)
    const memory = rated.length && rated.every((p) => p.estimate)
    if (rated.length) facts.push(rated.map((p) => `${p.name} ${p.stars ? `${p.stars}★` : p.thumbs === 1 ? 'thumbs up' : 'thumbs down'}${p.estimate && !memory ? ' (from memory)' : ''}`).join(', ') + (memory ? ', from memory' : ''))
    else facts.push('Not rated yet')
    if (meal.cooked) facts.push(t.undated ? `In your Notes ${meal.cooked} time${meal.cooked === 1 ? '' : 's'}, not made since you started the app` : `Made ${meal.cooked} time${meal.cooked === 1 ? '' : 's'}, last ${roughly(t.daysSince)} ago`)
    else facts.push('Never made')
    if (everyDays) facts.push(`Usually about every ${roughly(everyDays)}`)
    if (item) facts.push(`${item.portions} portion${item.portions === 1 ? '' : 's'} in the freezer`)
    if (traits.type && weekTypes.has(traits.type)) facts.push(`There's already a ${traits.type} this week`)
    else if (traits.protein && traits.protein !== 'veg' && weekProteins.has(traits.protein)) facts.push(`There's already ${traits.protein} this week`)
    if (traits.veggie && !weekHasVeggie && planned.length) facts.push('Would be the veggie night')
    if (tooSoon) facts.push(`Only had it ${t.daysSince} days ago`)

    const names = (ps: PersonView[]) => (ps.length === view.length && view.length > 1 ? 'You both' : ps.map((p) => p.name).join(' and '))
    let headline: string
    if (item && like >= 0) headline = `Ready in the freezer${bothLike ? ', and you both like it' : ''}`
    else if (bothLike && overdue) headline = `You both love it, and it's overdue`
    else if (bothLike) headline = `You both love it`
    else if (wanters.length) headline = `${names(wanters)} want${wanters.length === 1 && view.length > 1 ? 's' : ''} to try it`
    else if (oneSided) {
      const fan = view[levels.indexOf(hi)]
      headline = `${fan.name}'s favourite`
    } else if (overdue && like > 0) headline = `A favourite that's overdue`
    else if (!known.length && meal.cooked >= 3) headline = `Made often, never rated`
    else headline = like > 0 ? 'Liked' : 'Something different'

    ideas.push({
      mealId: meal.id,
      title,
      optionIds,
      score: Math.round(score * 100) / 100,
      headline,
      facts,
      people: view,
      made: meal.cooked,
      lastMade: meal.lastCooked,
      undated: t.undated,
      everyDays,
      daysSince: finite && !t.undated ? t.daysSince : null,
      overdue,
      bothLike,
      oneSided,
      wanted: wanters.length > 0,
      isNew: meal.cooked === 0,
      veggie: traits.veggie,
      effort: meal.effort,
      tags: meal.tags,
      protein: traits.protein,
      type: traits.type,
      ...(item ? { freezerItemId: item.id, frozenPortions: item.portions } : {}),
    })
  }

  // Spread the top: each pick makes others of its type or protein a little less likely.
  const left = [...ideas].sort((a, b) => b.score - a.score)
  const out: Idea[] = []
  const types = new Map<string, number>()
  const proteins = new Map<string, number>()
  while (left.length) {
    let bestI = 0
    let bestS = -Infinity
    for (let i = 0; i < Math.min(left.length, 40); i++) {
      const x = left[i]
      const s = x.score - 0.25 * ((x.type && types.get(x.type)) || 0) - 0.15 * ((x.protein && proteins.get(x.protein)) || 0)
      if (s > bestS) [bestS, bestI] = [s, i]
    }
    const [x] = left.splice(bestI, 1)
    out.push(x)
    if (x.type) types.set(x.type, (types.get(x.type) ?? 0) + 1)
    if (x.protein) proteins.set(x.protein, (proteins.get(x.protein) ?? 0) + 1)
  }
  return out
}
