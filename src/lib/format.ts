/** Shared wording. Plain and pure: suggest.ts uses it in Node tests too. */

/** "Dirty cabbage (Cajun, Kangaroo)": a meal with the variation chosen. */
export function withOptions(name: string, options: string[]): string {
  return options.length ? `${name} (${options.join(', ')})` : name
}

/** "5 stars" / "1 star". */
export function stars(n: number): string {
  return `${n} star${n === 1 ? '' : 's'}`
}
