<script lang="ts">
  import { addDays, today, weekDays, weekdayName, shortDate, weekLabel, weekStart } from '../lib/dates'
  import { app } from '../lib/state.svelte'
  import type { Day } from '../lib/types'

  let { start }: { start: Day } = $props()

  const days = $derived(weekDays(start))
  const isThisWeek = $derived(start === weekStart())
  const todayDay = today()
  const others = $derived(app.household?.members.filter((m) => !m.me) ?? [])
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

  <ol class="days">
    {#each days as day (day)}
      <li class="card day" class:today={day === todayDay}>
        <div class="date">
          <span class="weekday">{weekdayName(day)}</span>
          <span class="muted">{shortDate(day)}</span>
        </div>
        <span class="empty muted">Nothing planned</span>
      </li>
    {/each}
  </ol>
</section>

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
  .days {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .day {
    display: grid;
    grid-template-columns: 4.5rem 1fr;
    align-items: center;
    gap: 0.75rem;
    min-height: 64px;
    padding: 0.6rem 1rem;
  }
  .day.today {
    border-color: var(--accent);
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
  .empty {
    font-style: italic;
  }
</style>
