<script lang="ts">
  import Chevron from '../components/Chevron.svelte'
  import NightSheet from '../components/NightSheet.svelte'
  import TypeWeekSheet from '../components/TypeWeekSheet.svelte'
  import IdeasTray from '../components/IdeasTray.svelte'
  import { api } from '../lib/api'
  import { withOptions } from '../lib/format'
  import { suggestAll, weekBalance } from '../lib/suggest'
  import { history, loadHistory } from '../lib/suggestions.svelte'
  import { addDays, shortDate, today, weekDays, weekdayIndex, weekdayName, weekLabel, weekStart } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { clearNight, copyWeek, describe, entryFor, loadWeek, moveNight, plan, setNight } from '../lib/plan.svelte'
  import { freezer, loadFreezer, loadReview, review } from '../lib/review.svelte'
  import { app } from '../lib/state.svelte'
  import type { Day, PlanEntry } from '../lib/types'

  let { start: requested }: { start: Day } = $props()

  const startDay = $derived(app.household?.weekStartDay ?? 0)
  const start = $derived(weekStart(requested, startDay))
  const days = $derived(weekDays(start))
  const isThisWeek = $derived(start === weekStart(today(), startDay))
  const todayDay = today()
  const others = $derived(app.household?.members.filter((m) => !m.me) ?? [])
  const entries = $derived(plan.weeks[start] ?? [])
  const planned = $derived(entries.length)

  let open = $state<Day | null>(null) // the night's sheet (options, note, move)
  let typing = $state(false)
  let notice = $state('')
  let busy = $state(false)

  $effect(() => {
    void loadMeals()
    void loadWeek(start)
  })
  $effect(() => {
    void loadReview()
    void loadFreezer()
  })
  const frozenPortions = $derived(freezer.items.reduce((n, f) => n + f.portions, 0))
  $effect(() => void loadHistory())

  // Suggestions for this week's free nights (today onwards).
  const freeNights = $derived(days.filter((d) => d >= todayDay && !entries.some((e) => e.date === d)))
  const ideas = $derived(
    suggestAll({ meals: meals.list, history, freezer: freezer.items, members: app.household?.members ?? [], today: todayDay, planned: entries }),
  )
  const balance = $derived(weekBalance(entries, meals.list))
  const repeatsText = $derived(balance.repeats.length ? `${balance.repeats.join(' and ')} twice` : 'no repeats')

  async function copyLast(): Promise<void> {
    busy = true
    notice = ''
    try {
      const copied = await copyWeek(addDays(start, -7), start)
      notice = copied ? `Copied ${copied} night${copied === 1 ? '' : 's'} from last week.` : 'Nothing to copy: last week was empty, or every night here is planned.'
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  /* ------------------------------------------------------------------ */
  /* Each night is a line you type on, like a note. Return: the next line. */
  /* ------------------------------------------------------------------ */

  const KIND_TEXT = { out: 'Out', leftovers: 'Leftovers', takeaway: 'Takeaway' } as const

  /** What a planned night reads as on its line: "Fried rice (Prawn)", "Out". */
  function lineText(entry: PlanEntry | undefined): string {
    if (!entry) return ''
    if (entry.kind === 'out' || entry.kind === 'leftovers' || entry.kind === 'takeaway') return KIND_TEXT[entry.kind]
    const meal = meals.list.find((m) => m.id === entry.dishId)
    if (!meal) return entry.raw ?? ''
    return withOptions(meal.name, meal.options.filter((o) => entry.optionIds.includes(o.id)).map((o) => o.name))
  }

  function lineDetail(entry: PlanEntry | undefined): string {
    if (!entry) return ''
    return [entry.kind === 'freezer' ? 'From the freezer' : '', entry.note ?? ''].filter(Boolean).join(', ')
  }

  let drafts = $state<Record<Day, string>>({}) // lines typed but not yet saved
  let saving = $state<Record<Day, boolean>>({})
  // Lines that didn't match a meal: we ask rather than invent a new one.
  let unmatched = $state<Record<Day, { text: string; newName: string; candidates: { dishId: string; name: string }[] }>>({})

  const lineInput = (day: Day) => document.querySelector<HTMLInputElement>(`.days li[data-date="${day}"] input`)

  function onLineKey(e: KeyboardEvent, day: Day): void {
    const el = e.currentTarget as HTMLInputElement
    if (e.key === 'Escape') {
      delete drafts[day]
      el.value = lineText(entryFor(start, day))
      el.blur()
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Straight on to the next line (in the keypress, so the keyboard stays up); leaving this one saves it.
    const next = days[days.indexOf(day) + 1]
    if (next) lineInput(next)?.focus()
    else el.blur()
  }

  /** Save a line when you leave it: matched to a meal (and its options) the way "Type the week" does. */
  async function commit(day: Day, value: string): Promise<void> {
    const text = value.trim()
    const entry = entryFor(start, day)
    if (unmatched[day]?.text === text) return // still waiting on which meal it is
    delete unmatched[day]
    if (text === lineText(entry)) {
      delete drafts[day]
      return
    }
    saving[day] = true
    notice = ''
    try {
      if (!text) {
        if (entry) await clearNight(start, day)
      } else {
        const { items } = await api.parseWeek(start, `${weekdayName(day)} ${text}`)
        const r = items.find((i) => i.date === day) ?? items[0]
        if (!r) throw new Error(`Couldn't read "${text}". Try a meal name, or out, leftovers, takeaway.`)
        if (r.kind !== 'dish' && r.kind !== 'freezer') {
          await setNight(start, day, { kind: r.kind, raw: r.typed })
        } else {
          if (!r.dishId) {
            // Not sure what this is: keep the line as typed and ask underneath.
            unmatched[day] = { text, newName: r.newName ?? text, candidates: r.candidates.filter((c) => c.confidence > 0).slice(0, 2) }
            return
          }
          await setNight(start, day, { kind: 'dish', dishId: r.dishId, optionIds: r.optionIds, raw: r.raw })
        }
      }
      delete drafts[day]
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      saving[day] = false
    }
  }

  /** "Did you mean Dirty cabbage?": plan it, and remember the words for next time. */
  async function choose(day: Day, dishId: string): Promise<void> {
    const u = unmatched[day]
    if (!u) return
    saving[day] = true
    try {
      await setNight(start, day, { kind: 'dish', dishId, raw: u.text })
      await api.addAlias(dishId, u.text).catch(() => undefined)
      void loadMeals(true)
      delete unmatched[day]
      delete drafts[day]
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      saving[day] = false
    }
  }

  async function addNew(day: Day): Promise<void> {
    const u = unmatched[day]
    if (!u) return
    saving[day] = true
    try {
      const { meal } = await api.createMeal(u.newName)
      await loadMeals(true)
      await setNight(start, day, { kind: 'dish', dishId: meal.id, raw: u.text })
      delete unmatched[day]
      delete drafts[day]
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      saving[day] = false
    }
  }

  /* ------------------------------------------------------------------ */
  /* Drag a night onto another: empty, it moves; planned, they swap.      */
  /* By the grip, or a press and hold on the day name.                    */
  /* ------------------------------------------------------------------ */

  let drag = $state<{ from: Day; title: string; x: number; y: number; width: number; left: number } | null>(null)
  let over = $state<Day | null>(null)
  let holdTimer = 0
  let pressAt: { x: number; y: number } | null = null
  let justDragged = false

  function begin(el: HTMLElement, pointerId: number, x: number, y: number, day: Day): void {
    const entry = entryFor(start, day)
    if (!entry) return
    const box = (el.closest('li') as HTMLElement).getBoundingClientRect()
    drag = { from: day, title: describe(entry, meals.list).title, x, y, width: box.width, left: box.left }
    over = day
    try {
      el.setPointerCapture(pointerId)
    } catch {
      // Capture is a nicety; window listeners still follow the pointer.
    }
    navigator.vibrate?.(12)
  }

  function onGripDown(e: PointerEvent, day: Day): void {
    e.preventDefault()
    e.stopPropagation()
    begin(e.currentTarget as HTMLElement, e.pointerId, e.clientX, e.clientY, day)
  }

  function onRowDown(e: PointerEvent, day: Day): void {
    if (!entryFor(start, day) || e.button > 0) return
    pressAt = { x: e.clientX, y: e.clientY }
    const el = e.currentTarget as HTMLElement
    const { pointerId, clientX, clientY } = e
    window.clearTimeout(holdTimer)
    holdTimer = window.setTimeout(() => {
      if (pressAt) begin(el, pointerId, clientX, clientY, day)
    }, 380)
  }

  function onRowMove(e: PointerEvent): void {
    if (pressAt && !drag && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) cancelHold()
  }

  function cancelHold(): void {
    window.clearTimeout(holdTimer)
    pressAt = null
  }

  function dayAt(x: number, y: number): Day | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-date]') as HTMLElement | null
    return (el?.dataset.date as Day | undefined) ?? null
  }

  $effect(() => {
    if (!drag) return
    const move = (e: PointerEvent): void => {
      if (!drag) return
      drag.x = e.clientX
      drag.y = e.clientY
      over = dayAt(e.clientX, e.clientY) ?? over
      if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 14)
      else if (e.clientY < 70) window.scrollBy(0, -14)
    }
    const up = (): void => void drop()
    const cancel = (): void => end()
    const noScroll = (e: TouchEvent): void => e.preventDefault()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    document.addEventListener('touchmove', noScroll, { passive: false })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.removeEventListener('touchmove', noScroll)
    }
  })

  function end(): void {
    cancelHold()
    if (drag) justDragged = true
    drag = null
    over = null
    // A finger lifting after a drag can still produce a "tap" a moment later: ignore it.
    window.setTimeout(() => (justDragged = false), 450)
  }

  async function drop(): Promise<void> {
    const from = drag?.from
    const to = over
    const title = drag?.title ?? ''
    end()
    if (!from || !to || from === to) return
    const swapped = Boolean(entryFor(start, to))
    try {
      await moveNight(start, from, to)
      notice = swapped ? `Swapped ${weekdayName(from)} and ${weekdayName(to)}.` : `Moved ${title} to ${weekdayName(to)}.`
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    }
  }

  function openNight(day: Day): void {
    if (justDragged) return // the click that ends a drag isn't a tap
    open = day
  }
</script>

<section aria-labelledby="week-title">
  <header class="week-head">
    <div>
      <h1 id="week-title">{isThisWeek ? 'This week' : weekLabel(start)}</h1>
      {#if isThisWeek}<p class="muted range">{weekLabel(start)}</p>{/if}
    </div>
    <nav class="pager" aria-label="Weeks">
      <a class="btn btn-icon" href={`#/week/${addDays(start, -7)}`} aria-label="Previous week"><Chevron dir="left" /></a>
      <a class="btn btn-icon" href={`#/week/${addDays(start, 7)}`} aria-label="Next week"><Chevron /></a>
    </nav>
  </header>

  {#if others.length === 0}
    <p class="note">Planning just for you for now. <a href="#/settings">Link your partner</a> to share the plan.</p>
  {/if}
  {#if plan.error}<p class="error" role="alert">{plan.error}</p>{/if}

  <ol class="days" class:dragging={Boolean(drag)} aria-label={`${planned} of 7 nights planned`}>
    {#each days as day (day)}
      {@const entry = entryFor(start, day)}
      {@const detail = lineDetail(entry)}
      <li
        class={`day day-${weekdayIndex(day)}`}
        data-date={day}
        class:today={day === todayDay}
        class:filled={Boolean(entry)}
        class:quiet={entry && entry.kind !== 'dish' && entry.kind !== 'freezer'}
        class:source={drag?.from === day}
        class:target={drag && over === day && drag.from !== day}>
        <button
          type="button"
          class="date"
          aria-label={`${weekdayName(day)} ${shortDate(day)}: options, note, move`}
          onclick={() => openNight(day)}
          onpointerdown={(e) => onRowDown(e, day)}
          onpointermove={onRowMove}
          onpointerup={cancelHold}
          onpointerleave={cancelHold}
          oncontextmenu={(e) => entry && e.preventDefault()}>
          <span class="weekday">{weekdayName(day)}</span>
          <span class="num">{shortDate(day)}</span>
        </button>
        <span class="what">
          <input
            class="line"
            class:saving={saving[day]}
            value={drafts[day] ?? lineText(entry)}
            oninput={(e) => (drafts[day] = e.currentTarget.value)}
            onkeydown={(e) => onLineKey(e, day)}
            onblur={(e) => void commit(day, e.currentTarget.value)}
            placeholder="Plan dinner"
            aria-label={`Dinner on ${weekdayName(day)}`}
            autocomplete="off"
            autocapitalize="sentences"
            enterkeyhint="next" />
          {#if unmatched[day]}
            {@const u = unmatched[day]}
            <span class="ask">
              {#each u.candidates as c (c.dishId)}
                <button type="button" class="link" onclick={() => void choose(day, c.dishId)}>{c.name}?</button>
              {/each}
              <button type="button" class="link" onclick={() => void addNew(day)}>Add as new meal</button>
            </span>
          {:else if detail}<span class="detail">{detail}</span>{/if}
          {#if drag && over === day && drag.from !== day}
            <span class="drop-hint">{entry ? `Swap with ${weekdayName(drag.from)}` : 'Move here'}</span>
          {/if}
        </span>
        {#if entry}
          <button type="button" class="grip" aria-label={`Drag ${lineText(entry) || 'this night'} to another night`} onpointerdown={(e) => onGripDown(e, day)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
          </button>
        {/if}
      </li>
    {/each}
  </ol>

  {#if notice}<p class="notice muted" role="status">{notice}</p>{/if}
  <p class="balance muted">
    {#if planned}<span aria-label="Week balance">{balance.veggie} veggie, {balance.fresh} new, {repeatsText}.</span>{/if}
    <button type="button" class="link" disabled={busy} onclick={() => void copyLast()}>Copy last week</button>
    <button type="button" class="link" onclick={() => (typing = true)}>Paste a week</button>
  </p>

  <IdeasTray {start} all={ideas} {freeNights} />

  <div class="more">
    <a class="btn shop-link" href={`#/shop/${start}`}>Shopping list</a>
    <a class="freezer-link" href="#/freezer">Freezer{frozenPortions ? `: ${frozenPortions} portion${frozenPortions === 1 ? '' : 's'}` : ''}</a>
    {#if review.pending > 0}
      <a class="review-link" href="#/review">Review last week ({review.pending})</a>
    {/if}
  </div>
</section>

{#if drag}
  <!-- The dinner being carried, under the finger. -->
  <div
    class={`ghost day-${weekdayIndex(drag.from)}`}
    style={`width: ${drag.width - 24}px; transform: translate(${drag.left + 12}px, ${drag.y - 84}px)`}
    aria-hidden="true">
    <span class="weekday">{weekdayName(drag.from)}</span>
    <span class="meal">{drag.title}</span>
  </div>
{/if}

{#if open}
  <NightSheet {start} date={open} entry={entryFor(start, open)} onclose={() => (open = null)} />
{/if}
{#if typing}
  <TypeWeekSheet {start} onclose={() => (typing = false)} />
{/if}

<style>
  .week-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .range {
    margin: 0.2rem 0 0;
  }
  .pager {
    display: flex;
    gap: 0.4rem;
  }
  .pager .btn {
    border-width: 1px;
    border-color: var(--rule-strong);
  }
  .note {
    margin: 0 0 0.75rem;
    color: var(--pepper);
  }
  .note a {
    font-weight: 650;
    color: var(--plum);
  }

  /* The week: one line per night, each in its day's produce colour. */
  .days {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .day {
    position: relative;
    display: grid;
    grid-template-columns: 6.6rem minmax(0, 1fr);
    align-items: center;
    min-height: 46px;
    padding-right: 2.75rem;
    border: 1.5px dashed var(--rule-strong);
    border-radius: var(--r-row);
    transition: background-color 0.35s ease;
  }
  .day.filled {
    border: 0;
    border-left: 6px solid var(--day);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
  }
  .day.quiet {
    background: var(--plate);
  }
  .day:focus-within {
    outline: 2.5px solid var(--day);
    outline-offset: 2px;
  }
  .source {
    opacity: 0.35;
  }
  .target {
    outline: 2.5px solid var(--day);
    outline-offset: 2px;
  }
  .date {
    align-self: stretch;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0 0 0.75rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .filled .date {
    padding-left: calc(0.75rem - 4.5px);
  }
  .weekday {
    font-size: var(--s1);
    font-weight: 760;
    font-stretch: 75%;
    letter-spacing: -0.01em;
    color: var(--pepper);
  }
  .filled .weekday,
  .today .weekday,
  .ghost .weekday {
    color: var(--plum);
  }
  .num {
    font-size: var(--s-1);
    color: var(--pepper);
  }
  .today .num {
    color: var(--plum);
    font-weight: 700;
  }
  .what {
    position: relative;
    display: grid;
    min-width: 0;
  }
  /* The line itself: reads as text, types as an input. */
  .line {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.25rem;
    border: 0;
    background: transparent;
    color: var(--plum);
    font: inherit;
    font-size: 1.125rem; /* 18px: no zoom on focus on iOS */
    font-weight: 650;
    outline: none;
    text-overflow: ellipsis;
  }
  .line::placeholder {
    color: var(--rule-strong);
    font-weight: 450;
  }
  .quiet .line {
    color: var(--pepper);
    font-weight: 550;
  }
  .line.saving {
    opacity: 0.55;
  }
  .detail {
    margin: -0.55rem 0 0.35rem 0.25rem;
    font-size: var(--s-1);
    color: var(--pepper);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Under a line we couldn't place: which meal is it? */
  .ask .link {
    text-align: left;
  }
  .ask {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.9rem;
    margin: -0.45rem 0 0.45rem 0.25rem;
    font-size: var(--s-1);
  }
  .drop-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding-left: 0.25rem;
    background: var(--plate);
    font-weight: 700;
    color: var(--plum);
  }
  .grip {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 2.75rem;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--pepper);
    cursor: grab;
    touch-action: none;
  }
  .grip svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }
  .dragging .grip {
    cursor: grabbing;
  }
  .ghost {
    position: fixed;
    z-index: 40;
    top: 0;
    left: 0;
    display: grid;
    grid-template-columns: 4rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    min-height: 52px;
    padding: 0.5rem 1rem 0.5rem 0.75rem;
    border-radius: var(--r-row);
    border-left: 6px solid var(--day);
    background: color-mix(in srgb, var(--day) 22%, var(--plate));
    box-shadow: 0 10px 28px color-mix(in srgb, var(--plum) 25%, transparent);
    pointer-events: none;
    rotate: -1.5deg;
  }
  .meal {
    font-size: var(--s1);
    font-weight: 650;
  }
  .notice {
    margin: 0.5rem 0 0;
    font-size: var(--s-1);
    font-weight: 600;
  }
  .balance {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem 0.9rem;
    margin: 0.5rem 0 0;
    font-size: var(--s-1);
    font-weight: 600;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--plum);
    font: inherit;
    font-weight: 650;
    text-decoration: underline;
    cursor: pointer;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.25rem;
    margin-top: 1.5rem;
  }
  .freezer-link,
  .review-link {
    color: var(--pepper);
    font-weight: 650;
  }
</style>
