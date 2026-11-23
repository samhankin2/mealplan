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
  notes: MealNote[]
}

export interface Household {
  id: string
  members: Member[]
  partner: Partner | null
}
