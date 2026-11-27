/** YYYY-MM-DD, local calendar. */
export type Day = string

export interface User {
  id: string
  email: string
  displayName: string | null
}

export interface Member {
  id: string
  name: string
  me: boolean
}

export interface Partner {
  status: 'linked' | 'pending'
  email: string
  name?: string | null
}

export interface MealOption {
  id: string
  axis: string
  name: string
}

/** 'both' or a household member's user id. */
export type RatedAs = string

export interface Rating {
  optionId: string | null
  ratedAs: RatedAs
  thumbs: -1 | 1 | null
  stars: number | null
  source?: 'estimate' | 'review' // estimate = rated from memory; review = from a real cook
}

export interface MealNote {
  id: string
  body: string
  reply: string | null
  resolved: boolean
  createdAt: string
  createdBy: string | null
}

export interface Meal {
  id: string
  name: string
  family: string | null // section of related meals, e.g. "Pulled pork"
  tags: string[]
  suggestedTags: string[]
  effort: 1 | 2 | 3 | null
  tips: string | null
  link: string | null
  neverSuggest: boolean
  aliases: string[]
  options: MealOption[]
  cooked: number
  lastCooked: Day | null
  ratings: Rating[]
  hidden: string[] // variation / combination keys taken off the list ("never had it")
  regularEveryDays: number | null // a regular: suggest again after this many days
  coverPhotoId: string | null
  snoozedUntil: Day | null // "not now": out of suggestions until then
  photos: { id: string; entryId: string | null; createdAt: string }[]
  tipSuggestions: { note: string; count: number }[] // cook notes written 2+ times
  notes: MealNote[]
}

/** How much we want to make it: 1 some day, 2 keen, 3 really want. */
export type WantLevel = 1 | 2 | 3

/** A line on the want-to-make scratch pad: the words as typed, and the meal once found. */
export interface WantLine {
  id: string
  text: string
  level: WantLevel
  dishId: string | null
  optionIds: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
  done: boolean
}

export interface Household {
  id: string
  weekStartDay: number // 0 = Monday … 6 = Sunday
  weekStarts?: Day[] // dates a week started on a different day, oldest first
  members: Member[]
  partner: Partner | null
}

export type NightKind = 'dish' | 'freezer' | 'out' | 'leftovers' | 'takeaway'

/** One planned dinner. */
export interface PlanEntry {
  id: string
  date: Day
  slot: string
  kind: NightKind
  status: 'planned' | 'cooked' | 'skipped' | 'swapped' | 'moved'
  dishId: string | null
  optionIds: string[]
  note: string | null
  raw: string | null
  freezerItemId: string | null // a night eating frozen stock
  cookNote: string | null
  leftovers: boolean // covered a lunch
  frozenPortions: number
  tweakRetry: boolean
  reviewedAt: string | null
  updatedAt: string
}

/** One person's opinion of a cook. */
export interface CookReview {
  ratedAs: RatedAs
  thumbs: -1 | 1 | null
  stars: number | null
}

export type ReviewEntry = PlanEntry & { reviews: CookReview[] }

export interface FreezerItem {
  id: string
  dishId: string
  optionIds: string[]
  portions: number
  frozenOn: Day | null
  fromEntryId: string | null
}

export interface Week {
  start: Day
  end: Day
  entries: PlanEntry[]
}

/** A proposed night from typed text, before it's confirmed. */
export interface ParsedNight {
  date: Day
  raw: string
  typed: string
  kind: NightKind
  dishId: string | null
  optionIds: string[]
  confidence: number
  candidates: { dishId: string; name: string; confidence: number }[]
  newName: string | null
  by: 'code' | 'ai'
}

export type Section = 'market' | 'cold' | 'ambient'

export interface ShoppingItem {
  id: string
  name: string
  section: Section
  qty: string | null
  dishIds: string[] // the meals it's for
  checked: boolean
  updatedAt: string
}

export interface ShoppingWeek {
  week: Day
  to: Day // the last night it shops for
  items: ShoppingItem[]
  nights: { entryId: string; date: Day; dishId: string; optionIds: string[] }[] // meal nights to shop for
  usual: Record<string, { name: string; qty: string | null }[]> // what each meal needed last time
}
