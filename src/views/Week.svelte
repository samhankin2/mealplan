<script lang="ts">
  import Chevron from '../components/Chevron.svelte'
  import NightSheet from '../components/NightSheet.svelte'
  import TypeWeekSheet from '../components/TypeWeekSheet.svelte'
  import IdeasTray from '../components/IdeasTray.svelte'
  import { suggestAll, weekBalance } from '../lib/suggest'
  import { history, loadHistory } from '../lib/suggestions.svelte'
  import { addDays, shortDate, today, weekDays, weekdayIndex, weekdayName, weekLabel, weekStart } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { copyWeek, describe, entryFor, loadWeek, plan } from '../lib/plan.svelte'
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

  let open = $state<Day | null>(null)
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

  <ol class="days" aria-label={`${planned} of 7 nights planned`}>
    {#each days as day (day)}
      {@const entry = entryFor(start, day)}
      {@const shown = entry ? describe(entry, meals.list) : null}
      <li class={`day-${weekdayIndex(day)}`}>
        <button
          type="button"
          class="day"
          class:today={day === todayDay}
          class:filled={Boolean(entry)}
          class:quiet={entry && entry.kind !== 'dish' && entry.kind !== 'freezer'}
          onclick={() => (open = day)}>
          <span class="date">
            <span class="weekday">{weekdayName(day)}</span>
            <span class="num">{shortDate(day)}</span>
          </span>
          <span class="what">
            {#if shown}
              <span class="meal">{shown.title}</span>
              {#if shown.detail}<span class="detail">{shown.detail}</span>{/if}
            {:else}
              <span class="empty">Plan dinner</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>

  {#if planned}
    <p class="balance muted" aria-label="Week balance">{balance.veggie} veggie, {balance.fresh} new, {repeatsText}</p>
  {/if}

  <div class="tools">
    <button class="btn btn-primary" type="button" onclick={() => (typing = true)}>Type the week</button>
    <button class="btn" type="button" disabled={busy} onclick={() => void copyLast()}>Copy last week</button>
  </div>
  {#if notice}<p class="notice muted" role="status">{notice}</p>{/if}

  <IdeasTray {start} all={ideas} {freeNights} />

  <div class="more">
    <a class="btn shop-link" href={`#/shop/${start}`}>Shopping list</a>
    <a class="freezer-link" href="#/freezer">Freezer{frozenPortions ? `: ${frozenPortions} portion${frozenPortions === 1 ? '' : 's'}` : ''}</a>
  </div>
</section>

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
  .day {
    width: 100%;
    display: grid;
    grid-template-columns: 4.6rem minmax(0, 1fr);
    align-items: center;
    gap: 0.6rem;
    min-height: 68px;
    padding: 0.5rem 0.9rem 0.5rem 1rem;
    border: 1.5px dashed var(--rule-strong);
    border-radius: var(--r-row);
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: background-color 0.35s ease;
  }
  .day.filled {
    border: 0;
    border-left: 6px solid var(--day);
    padding-left: calc(1rem - 4.5px);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
  }
  .day.quiet {
    background: var(--plate);
  }
  .date {
    display: grid;
    line-height: 1;
  }
  .weekday {
    font-size: var(--s2);
    font-weight: 760;
    font-stretch: 75%;
    letter-spacing: -0.01em;
    color: var(--pepper);
  }
  .filled .weekday,
  .today .weekday {
    color: var(--plum);
  }
  .num {
    margin-top: 0.2rem;
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
  .balance {
    margin: 0.65rem 0 0;
    font-size: var(--s-1);
    font-weight: 600;
  }
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin: 1.25rem 0 0.5rem;
  }
  .notice {
    margin: 0 0 0.5rem;
    font-size: var(--s-1);
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
