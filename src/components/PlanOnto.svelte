<script lang="ts">
  /**
   * "Plan it": this week's free nights (next week's, once this week is full),
   * one tap to put a meal on one. A want that's only words goes on as words,
   * like typing it on the week, and the meal is found behind.
   */
  import { api } from '../lib/api'
  import { shortDate, today, weekDays, weekdayIndex, weekdayName } from '../lib/dates'
  import { loadWeek, plan, putNight, setNight } from '../lib/plan.svelte'
  import { currentPlan, loadPlans } from '../lib/plans.svelte'
  import type { Day } from '../lib/types'

  let {
    dishId,
    optionIds = [],
    words,
    label,
  }: { dishId: string | null; optionIds?: string[]; words: string; label: string } = $props()

  let open = $state(false)
  let busy = $state(false)
  let done = $state('')
  let error = $state('')

  // The current plan's free nights from today.
  const run = $derived(currentPlan())
  const target = $derived(
    run
      ? { start: run.start, label: 'The plan', nights: weekDays(run.start, run.nights).filter((d) => d >= today() && !(plan.weeks[run.start] ?? []).some((e) => e.date === d)) }
      : { start: today(), label: '', nights: [] as Day[] },
  )

  $effect(() => {
    if (!open) return
    void loadPlans()
    if (run) void loadWeek(run.start, run.nights)
  })

  async function put(date: Day): Promise<void> {
    busy = true
    error = ''
    const start = target.start
    try {
      if (dishId) {
        await setNight(start, date, { kind: 'dish', dishId, optionIds, raw: words })
      } else {
        const { entry, pending } = await api.textNight(date, words)
        putNight(start, date, entry)
        if (pending) void api.matchNight(date).then((r) => r.entry && putNight(start, date, r.entry)).catch(() => undefined)
      }
      done = `On ${weekdayName(date)} ${shortDate(date)}.`
      open = false
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }
</script>

<span class="plan-onto">
  <button type="button" class="link plan-it" aria-expanded={open} onclick={() => ((open = !open), (done = ''))}>{open ? 'Close' : 'Plan it'}</button>
  {#if done}<span class="done">{done}</span>{/if}
</span>
{#if open}
  <span class="nights" role="group" aria-label={`Plan ${label} on`}>
    {#if target.nights.length}
      <span class="when muted">{target.label}</span>
      {#each target.nights as d (d)}
        <button type="button" class={`night day-${weekdayIndex(d)}`} disabled={busy} aria-label={`Plan ${label} on ${weekdayName(d)}`} onclick={() => void put(d)}>{weekdayName(d)}</button>
      {/each}
    {:else}
      <span class="muted">{run ? "Every night of the plan is planned." : "No plan yet."} <a href="#/week">Plan</a></span>
    {/if}
  </span>
  {#if error}<span class="error small" role="alert">{error}</span>{/if}
{/if}

<style>
  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .plan-onto {
    display: inline-flex;
    gap: 0.6rem;
    align-items: baseline;
  }
  .plan-it {
    color: var(--plum);
    font-weight: 700;
  }
  .done {
    color: var(--leek);
    font-weight: 650;
  }
  .nights {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .when {
    margin-right: 0.2rem;
    font-size: var(--s-1);
    font-weight: 650;
  }
  .night {
    min-height: 38px;
    min-width: 3rem;
    padding: 0 0.55rem;
    border-radius: var(--r-row);
    border: 0;
    border-left: 3px solid var(--day);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
    color: var(--plum);
    font: inherit;
    font-weight: 700;
    font-stretch: 85%;
    cursor: pointer;
  }
</style>
