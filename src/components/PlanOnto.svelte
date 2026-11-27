<script lang="ts">
  /**
   * "Plan it": this week's free nights (next week's, once this week is full),
   * one tap to put a meal on one. A want that's only words goes on as words,
   * like typing it on the week, and the meal is found behind.
   */
  import { api } from '../lib/api'
  import { addDays, today, weekDays, weekdayIndex, weekdayName, weekStart } from '../lib/dates'
  import { loadWeek, plan, putNight, setNight } from '../lib/plan.svelte'
  import { app } from '../lib/state.svelte'
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

  const startDay = $derived(app.household?.weekStartDay ?? 0)
  const thisWeek = $derived(weekStart(today(), startDay))
  const nextWeek = $derived(weekStart(addDays(thisWeek, weekDays(thisWeek).length), startDay))
  const freeIn = (start: Day) => weekDays(start).filter((d) => d >= today() && !(plan.weeks[start] ?? []).some((e) => e.date === d))
  const target = $derived(freeIn(thisWeek).length ? { start: thisWeek, label: 'This week', nights: freeIn(thisWeek) } : { start: nextWeek, label: 'Next week', nights: freeIn(nextWeek) })

  $effect(() => {
    if (!open) return
    void loadWeek(thisWeek)
    void loadWeek(nextWeek)
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
      done = `On ${weekdayName(date)}${start === thisWeek ? '' : ' next week'}.`
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
      <span class="muted">No free nights this week or next.</span>
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
