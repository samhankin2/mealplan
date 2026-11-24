<script lang="ts">
  import { shortDate, weekdayIndex, weekdayName } from '../lib/dates'
  import { meals } from '../lib/meals.svelte'
  import { setNight } from '../lib/plan.svelte'
  import { notNow } from '../lib/suggestions.svelte'
  import { fitsNight, tray, type Suggestion } from '../lib/suggest'
  import type { Day } from '../lib/types'

  let { start, all, freeNights }: { start: Day; all: Suggestion[]; freeNights: Day[] } = $props()

  let open = $state<string | null>(null) // suggestion being placed on a night
  let error = $state('')
  let collapsed = $state(false)

  const lanes = $derived(tray(all, meals.list))
  const key = (s: Suggestion) => `${s.lane}:${s.mealId}:${s.freezerItemId ?? ''}`

  async function place(s: Suggestion, date: Day): Promise<void> {
    error = ''
    try {
      if (s.freezerItemId) await setNight(start, date, { kind: 'freezer', freezerItemId: s.freezerItemId })
      else await setNight(start, date, { kind: 'dish', dishId: s.mealId, optionIds: s.optionIds ?? [] })
      open = null
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function snooze(s: Suggestion): Promise<void> {
    error = ''
    try {
      await notNow(s.mealId)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
</script>

{#if lanes.length && freeNights.length}
  <section class="ideas" aria-labelledby="ideas-title">
    <div class="ideas-head">
      <h2 id="ideas-title">Ideas for this week</h2>
      <button type="button" class="link" aria-expanded={!collapsed} onclick={() => (collapsed = !collapsed)}>{collapsed ? 'Show' : 'Hide'}</button>
    </div>
    {#if !collapsed}
      {#each lanes as l (l.lane)}
        <h3>{l.title}</h3>
        <ul>
          {#each l.items as s (key(s))}
            {@const meal = meals.list.find((m) => m.id === s.mealId)}
            <li>
              <div class="row">
                <button type="button" class="idea" aria-expanded={open === key(s)} onclick={() => (open = open === key(s) ? null : key(s))}>
                  <span class="title">{s.lane === 'freezer' ? '❄ ' : ''}{s.title}</span>
                  <span class="reason">{s.reason}</span>
                </button>
                {#if s.lane !== 'freezer'}
                  <button type="button" class="not-now" aria-label={`Not now: ${s.title}`} onclick={() => void snooze(s)}>Not now</button>
                {/if}
              </div>
              {#if open === key(s)}
                <div class="nights" role="group" aria-label={`Plan ${s.title} on`}>
                  {#each freeNights.filter((d) => fitsNight(s, meal, d)) as d (d)}
                    <button type="button" class={`night day-${weekdayIndex(d)}`} onclick={() => void place(s, d)}>{weekdayName(d)} {shortDate(d)}</button>
                  {:else}
                    <span class="muted small">No free night suits it. Weeknights skip high-effort meals.</span>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/each}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    {/if}
  </section>
{/if}

<style>
  .ideas {
    display: grid;
    gap: 0.35rem;
    margin: 1.75rem 0 0;
    padding-top: 1.25rem;
    border-top: 1px solid var(--rule);
  }
  .ideas-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h2 {
    font-size: var(--s2);
    font-stretch: 85%;
  }
  h3 {
    margin: 0.75rem 0 0.15rem;
    font-size: var(--s-1);
    font-weight: 650;
    color: var(--pepper);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .row {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
  }
  .idea {
    flex: 1;
    display: grid;
    gap: 0.1rem;
    padding: 0.55rem 0.8rem;
    border-radius: var(--r-row);
    border: 1px solid var(--rule);
    background: var(--plate);
    color: var(--plum);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .idea[aria-expanded='true'] {
    border-color: var(--plum);
  }
  .title {
    font-weight: 650;
    line-height: 1.2;
  }
  .reason {
    font-size: var(--s-1);
    color: var(--pepper);
  }
  .not-now {
    border: none;
    background: none;
    color: var(--pepper);
    font-size: var(--s-1);
    font-weight: 650;
    cursor: pointer;
    padding: 0 0.5rem;
  }
  /* Placing an idea: each free night in its own day colour. */
  .nights {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.45rem 0 0.25rem;
  }
  .night {
    min-height: 38px;
    padding: 0 0.8rem 0 0.65rem;
    border-radius: var(--r-row);
    border: 0;
    border-left: 5px solid var(--day);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
    color: var(--plum);
    font-weight: 650;
    font-size: var(--s-1);
    cursor: pointer;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--pepper);
    font-weight: 650;
    cursor: pointer;
    text-decoration: underline;
  }
</style>
