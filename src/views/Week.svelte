<script lang="ts">
  import Chevron from '../components/Chevron.svelte'
  import NightSheet from '../components/NightSheet.svelte'
  import WeekComposer from '../components/WeekComposer.svelte'
  import { tick } from 'svelte'
  import TypeWeekSheet from '../components/TypeWeekSheet.svelte'
  import IdeasTray from '../components/IdeasTray.svelte'
  import { suggestAll, weekBalance } from '../lib/suggest'
  import { history, loadHistory } from '../lib/suggestions.svelte'
  import { addDays, shortDate, today, weekDays, weekdayIndex, weekdayName, weekLabel, weekStart } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { copyWeek, describe, entryFor, loadWeek, moveNight, plan } from '../lib/plan.svelte'
  import { freezer, loadFreezer, loadReview, review } from '../lib/review.svelte'
  import { app } from '../lib/state.svelte'
  import type { Day } from '../lib/types'

  let { start: requested }: { start: Day } = $props()

  const startDay = $derived(app.household?.weekStartDay ?? 0)
  const start = $derived(weekStart(requested, startDay))
  const days = $derived(weekDays(start))
  const isThisWeek = $derived(start === weekStart(today(), startDay))
  const todayDay = today()
  const others = $derived(app.household?.members.filter((m) => !m.me) ?? [])
  const entries = $derived(plan.weeks[start] ?? [])
  const planned = $derived(entries.length)

  let open = $state<Day | null>(null) // the night's full sheet (note, move)
  let active = $state<Day | null>(null) // the night the docked line is filling
  let composer: { focus: () => void } | undefined = $state()

  // The night being filled stays in view above the keyboard.
  $effect(() => {
    const d = active
    if (!d) return
    void tick().then(() => document.querySelector(`.days li[data-date="${d}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  })
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
  /* Drag a night onto another: empty, it moves; planned, they swap.      */
  /* The grip starts a drag at once; a press and hold on the row does too. */
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
      // Still holding still: pick it up.
      if (pressAt) begin(el, pointerId, clientX, clientY, day)
    }, 380)
  }

  function onRowMove(e: PointerEvent): void {
    // Moving before the hold finishes is a scroll or a tap, not a drag.
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
      // Near the top or bottom of the screen: scroll to reach the rest of the week.
      if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 14)
      else if (e.clientY < 70) window.scrollBy(0, -14)
    }
    const up = (): void => void drop()
    const cancel = (): void => end()
    // While dragging, a finger moving must not scroll the page.
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
    active = day
    composer?.focus() // in the tap itself, so the keyboard comes up
  }
</script>

<section aria-labelledby="week-title" class:composing={active !== null}>
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

  {#if review.pending > 0}
    <a class="review-banner" href="#/review">
      <strong>Review last week</strong>
      <span>{review.pending} dinner{review.pending === 1 ? '' : 's'} to rate</span>
    </a>
  {/if}

  {#if others.length === 0}
    <p class="note">Planning just for you for now. <a href="#/settings">Link your partner</a> to share the plan.</p>
  {/if}
  {#if plan.error}<p class="error" role="alert">{plan.error}</p>{/if}

  <ol class="days" class:dragging={Boolean(drag)} aria-label={`${planned} of 7 nights planned`}>
    {#each days as day (day)}
      {@const entry = entryFor(start, day)}
      {@const shown = entry ? describe(entry, meals.list) : null}
      <li class={`day-${weekdayIndex(day)}`} data-date={day} class:source={drag?.from === day} class:target={drag && over === day && drag.from !== day}>
        <button
          type="button"
          class="day"
          class:today={day === todayDay}
          class:active={active === day}
          class:filled={Boolean(entry)}
          class:quiet={entry && entry.kind !== 'dish' && entry.kind !== 'freezer'}
          onclick={() => openNight(day)}
          onpointerdown={(e) => onRowDown(e, day)}
          onpointermove={onRowMove}
          onpointerup={cancelHold}
          onpointerleave={cancelHold}
          oncontextmenu={(e) => entry && e.preventDefault()}>
          <span class="date">
            <span class="weekday">{weekdayName(day)}</span>
            <span class="num">{shortDate(day)}</span>
          </span>
          <span class="what">
            {#if drag && over === day && drag.from !== day}
              <span class="drop-hint">{entry ? `Swap with ${weekdayName(drag.from)}` : 'Move here'}</span>
            {:else if shown}
              <span class="meal">{shown.title}</span>
              {#if shown.detail}<span class="detail">{shown.detail}</span>{/if}
            {:else}
              <span class="empty">Plan dinner</span>
            {/if}
          </span>
        </button>
        {#if entry}
          <button type="button" class="grip" aria-label={`Drag ${shown?.title ?? 'this night'} to another night`} onpointerdown={(e) => onGripDown(e, day)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
          </button>
        {/if}
      </li>
    {/each}
  </ol>
  {#if planned > 1 && !notice}<p class="hint muted">Drag a dinner by its grip to move it. Drop it on another dinner to swap.</p>{/if}

  {#if planned}
    <p class="balance muted" aria-label="Week balance">{balance.veggie} veggie, {balance.fresh} new, {repeatsText}</p>
  {/if}
  {#if notice}<p class="notice muted" role="status">{notice}</p>{/if}

  <div class="tools">
    <button class="btn btn-primary" type="button" onclick={() => (typing = true)}>Type the week</button>
    <button class="btn" type="button" disabled={busy} onclick={() => void copyLast()}>Copy last week</button>
  </div>

  <IdeasTray {start} all={ideas} {freeNights} />

  <div class="more">
    <a class="btn shop-link" href={`#/shop/${start}`}>Shopping list</a>
    <a class="freezer-link" href="#/freezer">Freezer{frozenPortions ? `: ${frozenPortions} portion${frozenPortions === 1 ? '' : 's'}` : ''}</a>
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

<WeekComposer bind:this={composer} {start} bind:selected={active} {ideas} onmore={(d) => (open = d)} />

{#if open}
  <NightSheet {start} date={open} entry={entryFor(start, open)} onclose={() => { open = null; composer?.focus() }} />
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
    margin-bottom: 1rem;
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
  .review-banner {
    display: grid;
    gap: 0.05rem;
    margin-bottom: 1rem;
    padding: 0.8rem 1rem;
    border-radius: var(--r-row);
    background: var(--plum);
    color: var(--on-accent);
    text-decoration: none;
  }
  .review-banner span {
    font-size: var(--s-1);
    opacity: 0.85;
  }
  .note {
    margin: 0 0 1rem;
    color: var(--pepper);
  }
  .note a {
    font-weight: 650;
    color: var(--plum);
  }

  /* The week: each day owns a produce colour. Planned nights take it on. */
  .days {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }
  .days li {
    position: relative;
  }
  .day {
    width: 100%;
    display: grid;
    grid-template-columns: 6.4rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0.35rem 3rem 0.35rem 0.9rem;
    border: 1.5px dashed var(--rule-strong);
    border-radius: var(--r-row);
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: background-color 0.35s ease;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .day.filled {
    border: 0;
    border-left: 6px solid var(--day);
    padding-left: calc(0.9rem - 4.5px);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
  }
  .day.quiet {
    background: var(--plate);
  }
  /* Dragging: the night being carried fades; the night under the finger shows where it'll land. */
  .source .day {
    opacity: 0.35;
  }
  .day.active {
    outline: 2.5px solid var(--day);
    outline-offset: 2px;
  }
  /* Room to scroll the last nights clear of the docked line. */
  .composing {
    padding-bottom: 9rem;
  }
  .target .day {
    outline: 2.5px solid var(--day);
    outline-offset: 2px;
  }
  .drop-hint {
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
    min-height: 60px;
    padding: 0.5rem 1rem 0.5rem 0.75rem;
    border-radius: var(--r-row);
    border-left: 6px solid var(--day);
    background: color-mix(in srgb, var(--day) 22%, var(--plate));
    box-shadow: 0 10px 28px color-mix(in srgb, var(--plum) 25%, transparent);
    pointer-events: none;
    rotate: -1.5deg;
  }
  .date {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    line-height: 1;
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
    display: grid;
    min-width: 0;
  }
  .meal {
    font-size: var(--s1);
    font-weight: 650;
    line-height: 1.15;
  }
  .quiet .meal {
    color: var(--pepper);
    font-weight: 550;
  }
  .detail {
    margin-top: 0.15rem;
    font-size: var(--s-1);
    color: var(--pepper);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    color: var(--pepper);
  }
  .hint {
    margin: 0.6rem 0 0;
    font-size: var(--s-1);
  }
  .balance {
    margin: 0.4rem 0 0;
    font-size: var(--s-1);
    font-weight: 600;
  }
  .notice {
    margin: 0.4rem 0 0;
    font-size: var(--s-1);
    font-weight: 600;
  }
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin: 1.25rem 0 0.5rem;
  }
  .more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .freezer-link {
    color: var(--pepper);
    font-weight: 650;
  }
</style>
