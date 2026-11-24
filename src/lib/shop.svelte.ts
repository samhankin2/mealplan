import { api, ApiError } from './api'
import type { Day, Meal, Section, ShoppingItem, ShoppingWeek } from './types'

export const SECTION_ORDER: Section[] = ['market', 'cold', 'ambient']
export const SECTION_NAMES: Record<Section, string> = { market: 'Market', cold: 'Cold', ambient: 'Ambient' }

/** The open week's list. Shared between our phones: refreshed on focus and every 20 s while open. */
export const shop = $state({
  data: null as ShoppingWeek | null,
  error: '',
  pending: new Set<string>(), // ticks waiting for signal
})

let current: Day | null = null

export async function loadShop(week: Day): Promise<void> {
  current = week
  shop.error = ''
  try {
    await flushOutbox()
    const data = await api.shopping(week)
    if (current !== week) return
    // Ticks still waiting for signal win over what the server has.
    const waiting = readOutbox()
    for (const item of data.items) if (item.id in waiting) item.checked = waiting[item.id]
    shop.data = data
  } catch (e) {
    if (!shop.data) shop.error = e instanceof Error ? e.message : String(e)
  }
}

if (typeof window !== 'undefined') {
  const refresh = () => current && void loadShop(current)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh())
  window.addEventListener('online', refresh)
}

let timer: number | undefined
/** Poll while the list is on screen, so the other person's ticks show up. */
export function watchShop(week: Day): () => void {
  window.clearInterval(timer)
  timer = window.setInterval(() => document.visibilityState === 'visible' && void loadShop(week), 20_000)
  return () => window.clearInterval(timer)
}

function put(item: ShoppingItem): void {
  if (!shop.data) return
  const others = shop.data.items.filter((i) => i.id !== item.id)
  shop.data.items = [...others, item]
}

/** "2 onions", "onions x2", "500g mince": amount and name from what was typed. */
export function splitQty(text: string): { name: string; qty: string | null } {
  const t = text.trim().replace(/\s+/g, ' ')
  const front = t.match(/^(\d+(?:[.,]\d+)?\s*(?:x|kg|g|ml|l|tins?|cans?|packs?|bunch(?:es)?|heads?)?)\s+(.+)$/i)
  if (front) return { qty: front[1].replace(/\s+/g, ''), name: front[2] }
  const back = t.match(/^(.+?)\s*x\s*(\d+)$/i)
  if (back) return { name: back[1], qty: `x${back[2]}` }
  return { name: t, qty: null }
}

export async function addItem(week: Day, text: string, dishId: string | null, section: Section | null = null): Promise<ShoppingItem> {
  const split = splitQty(text)
  const name = split.name.replace(/^./, (c) => c.toUpperCase())
  const qty = split.qty
  const { item } = await api.addShoppingItem({ week, name, qty, dishId, section })
  put(item)
  return item
}

export async function setSection(item: ShoppingItem, section: Section): Promise<void> {
  const before = item.section
  put({ ...item, section })
  try {
    put((await api.updateShoppingItem(item.id, { section })).item)
  } catch (e) {
    put({ ...item, section: before })
    throw e
  }
}

export async function removeItem(item: ShoppingItem, dishId?: string): Promise<void> {
  const { item: left } = await api.removeShoppingItem(item.id, dishId)
  if (left) put(left)
  else if (shop.data) shop.data.items = shop.data.items.filter((i) => i.id !== item.id)
}

export async function clearTicked(week: Day): Promise<number> {
  const { cleared } = await api.clearChecked(week)
  if (shop.data) shop.data.items = shop.data.items.filter((i) => !i.checked)
  return cleared
}

/* ------------------------------------------------------------------ */
/* Ticking in the shop: works without signal                            */
/* ------------------------------------------------------------------ */

const OUTBOX = 'mealplan:shop-outbox'
function readOutbox(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(OUTBOX) || '{}')
  } catch {
    return {}
  }
}
function writeOutbox(box: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(OUTBOX, JSON.stringify(box))
  } catch {
    // Storage blocked: the tick stays on screen until the page reloads.
  }
  shop.pending = new Set(Object.keys(box))
}

export async function tick(item: ShoppingItem, checked: boolean): Promise<void> {
  put({ ...item, checked })
  try {
    put((await api.updateShoppingItem(item.id, { checked })).item)
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      writeOutbox({ ...readOutbox(), [item.id]: checked }) // no signal: send it later
      return
    }
    put(item)
    throw e
  }
}

async function flushOutbox(): Promise<void> {
  const box = readOutbox()
  for (const [id, checked] of Object.entries(box)) {
    try {
      await api.updateShoppingItem(id, { checked })
      delete box[id]
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) break // still no signal
      delete box[id] // gone or invalid: drop it
    }
  }
  writeOutbox(box)
}

/* ------------------------------------------------------------------ */
/* Showing the list                                                     */
/* ------------------------------------------------------------------ */

/** "Mon, Thu": the nights an item is for. */
export function nightsFor(item: ShoppingItem, data: ShoppingWeek, weekdayName: (d: Day) => string): string {
  return data.nights
    .filter((n) => item.dishIds.includes(n.dishId))
    .map((n) => weekdayName(n.date))
    .join(', ')
}

/** The list as text, in shop order, to paste into Notes or a message. */
export function asText(data: ShoppingWeek): string {
  const lines: string[] = []
  for (const section of SECTION_ORDER) {
    const items = data.items.filter((i) => i.section === section && !i.checked).sort((a, b) => a.name.localeCompare(b.name))
    if (!items.length) continue
    lines.push(SECTION_NAMES[section])
    for (const i of items) lines.push(`- ${i.name}${i.qty ? ` (${i.qty})` : ''}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}

export function mealLabel(meals: Meal[], dishId: string, optionIds: string[]): string {
  const meal = meals.find((m) => m.id === dishId)
  if (!meal) return 'A meal'
  const names = meal.options.filter((o) => optionIds.includes(o.id)).map((o) => o.name)
  return [meal.name, ...names].join(' · ')
}
