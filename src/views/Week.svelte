<script lang="ts">
  import NightSheet from '../components/NightSheet.svelte'
  import TypeWeekSheet from '../components/TypeWeekSheet.svelte'
  import { addDays, shortDate, today, weekDays, weekdayName, weekLabel, weekStart } from '../lib/dates'
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
  <div class="week-head">
    <a class="btn btn-icon" href={`#/week/${addDays(start, -7)}`} aria-label="Previous week">‹</a>
    <div class="title">
      <h1 id="week-title">{isThisWeek ? 'This week' : weekLabel(start)}</h1>
      {#if isThisWeek}<p class="muted">{weekLabel(start)}</p>{/if}
    </div>
    <a class="btn btn-icon" href={`#/week/${addDays(start, 7)}`} aria-label="Next week">›</a>
  </div>

  {#if others.length === 0}
    <p class="note card">
      Planning just for you for now. <a href="#/settings">Link your partner</a> to share the plan.
    </p>
  {/if}

  {#if review.pending > 0}
    <a class="card review-banner" href="#/review">
      <span>
        <strong>Review last week</strong>
        <span class="muted">{review.pending} dinner{review.pending === 1 ? '' : 's'} to rate. Takes a minute.</span>
      </span>
      <span aria-hidden="true">›</span>
    </a>
  {/if}

  <div class="tools">
    <button class="btn btn-primary" type="button" onclick={() => (typing = true)}>Type the week</button>
    <button class="btn" type="button" disabled={busy} onclick={() => void copyLast()}>Copy last week</button>
  </div>
  <a class="freezer-link muted" href="#/freezer">Freezer{frozenPortions ? ` · ${frozenPortions} portion${frozenPortions === 1 ? '' : 's'}` : ''} ›</a>
  {#if notice}<p class="notice muted" role="status">{notice}</p>{/if}
  {#if plan.error}<p class="error" role="alert">{plan.error}</p>{/if}

  <ol class="days" aria-label={`${planned} of 7 nights planned`}>
    {#each days as day (day)}
      {@const entry = entryFor(start, day)}
      {@const shown = entry ? describe(entry, meals.list) : null}
      <li>
        <button type="button" class="card day" class:today={day === todayDay} class:filled={Boolean(entry)} class:quiet={entry && entry.kind !== 'dish'} onclick={() => (open = day)}>
          <span class="date">
            <span class="weekday">{weekdayName(day)}</span>
            <span class="muted">{shortDate(day)}</span>
          </span>
          <span class="what">
            {#if shown}
              <span class="meal">{shown.title}</span>
              {#if shown.detail}<span class="detail muted">{shown.detail}</span>{/if}
            {:else}
              <span class="empty muted">+ Plan dinner</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ol>
</section>

{#if open}
  <NightSheet {start} date={open} entry={entryFor(start, open)} onclose={() => (open = null)} />
{/if}
{#if typing}
  <TypeWeekSheet {start} onclose={() => (typing = false)} />
{/if}

<style>
  .week-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .title {
    text-align: center;
  }
  .title p {
    margin: 0.1rem 0 0;
    font-size: 0.9rem;
  }
  h1 {
    font-size: 1.6rem;
  }
  .note {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    background: var(--herb-soft);
    border-color: transparent;
    box-shadow: none;
  }
  .note a {
    color: var(--herb);
    font-weight: 600;
  }
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .review-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.8rem 1rem;
    margin-bottom: 0.75rem;
    background: #f7e7c3;
    border-color: #e2a33b;
    color: #4a3204;
    text-decoration: none;
    font-size: 1.2rem;
  }
  .review-banner span:first-child {
    display: grid;
    font-size: 1rem;
  }
  .review-banner .muted {
    color: #6b4f16;
    font-size: 0.9rem;
  }
  .freezer-link {
    display: inline-block;
    margin: -0.25rem 0 0.75rem;
    font-weight: 600;
    text-decoration: none;
    font-size: 0.9rem;
  }
  .notice {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
  }
  .days {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .day {
    width: 100%;
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-height: 64px;
    padding: 0.6rem 1rem;
    text-align: left;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .day.today {
    border-color: var(--accent);
  }
  .day.quiet .meal {
    color: var(--text-muted);
  }
  .date {
    display: grid;
    line-height: 1.25;
  }
  .date .muted {
    font-size: 0.85rem;
  }
  .weekday {
    font-weight: 700;
  }
  .today .weekday {
    color: var(--accent);
  }
  .what {
    display: grid;
    min-width: 0;
  }
  .meal {
    font-weight: 600;
    font-size: 1.05rem;
  }
  .detail {
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    font-style: italic;
  }
</style>
