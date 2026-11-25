import type { Day } from './types'

/**
 * Dates a week started on a different day ("this week starts Thursday"),
 * oldest first, from the household. Weeks run seven days from the latest one.
 */
export const weeks = $state({ starts: [] as Day[] })
