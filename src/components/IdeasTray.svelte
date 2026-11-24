<script lang="ts">
  import { shortDate, weekdayName } from '../lib/dates'
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
  <section class="card ideas" aria-labelledby="ideas-title">
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
                  <span class="reason muted">{s.reason}</span>
                </button>
                {#if s.lane !== 'freezer'}
                  <button type="button" class="not-now" aria-label={`Not now: ${s.title}`} onclick={() => void snooze(s)}>Not now</button>
                {/if}
              </div>
              {#if open === key(s)}
                <div class="nights">
                  {#each freeNights.filter((d) => fitsNight(s, meal, d)) as d (d)}
                    <button type="button" class="night" onclick={() => void place(s, d)}>{weekdayName(d)} {shortDate(d)}</button>
                  {:else}
                    <span class="muted small">No free night suits it (weeknights skip high-effort meals).</span>
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
    gap: 0.4rem;
    padding: 0.85rem 1rem 1rem;
    margin-bottom: 0.9rem;
  }
  .ideas-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h2 {
    font-size: 1.2rem;
  }
  h3 {
    margin: 0.5rem 0 0.1rem;
    font-family: var(--font-body);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .row {
    display: flex;
    align-items: stretch;
    gap: 0.3rem;
  }
  .idea {
    flex: 1;
    display: grid;
    gap: 0.05rem;
    padding: 0.45rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-sunken);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .title {
    font-weight: 600;
  }
  .reason {
    font-size: 0.82rem;
  }
  .not-now {
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0 0.4rem;
  }
  .nights {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.4rem 0 0.2rem;
  }
  .night {
    min-height: 34px;
    padding: 0 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: var(--surface);
    color: var(--accent);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }
  .small {
    font-size: 0.85rem;
  }
</style>
