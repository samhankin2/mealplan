import type { Day } from './types'

/** A Date's local calendar day as YYYY-MM-DD. */
export function toDay(date: Date): Day {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Noon local time, so adding days never trips over a daylight-saving change. */
export function fromDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toDay(fromDay(value)) === value
}

export function addDays(day: Day, n: number): Day {
  const date = fromDay(day)
  date.setDate(date.getDate() + n)
  return toDay(date)
}

export function today(): Day {
  return toDay(new Date())
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: Day): number {
  return (fromDay(day).getDay() + 6) % 7
}

/** The first day of the week holding `day`; weeks start on `startDay` (0 = Monday, the default). */
export function weekStart(day: Day = today(), startDay = 0): Day {
  return addDays(day, -((weekdayIndex(day) - startDay + 7) % 7))
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function weekDays(start: Day): Day[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

const weekdayFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short' })
const shortFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' })

export function weekdayName(day: Day): string {
  return weekdayFmt.format(fromDay(day))
}

export function shortDate(day: Day): string {
  return shortFmt.format(fromDay(day))
}

/** "24 Nov – 30 Nov" */
export function weekLabel(start: Day): string {
  return `${shortDate(start)} – ${shortDate(addDays(start, 6))}`
}
