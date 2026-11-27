<script lang="ts">
  /**
   * Ideas, in full: why each meal is suggested, how each of us rates it, when
   * we last had it, and a button for each free night to plan it there.
   */
  import Chevron from '../components/Chevron.svelte'
  import { api } from '../lib/api'
  import { addDays, previousWeek, shortDate, today, weekDays, weekdayIndex, weekdayName, weekLabel, weekStart } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { loadWeek, plan, setNight } from '../lib/plan.svelte'
  import { freezer, loadFreezer } from '../lib/review.svelte'
  import { app } from '../lib/state.svelte'
  import { rankIdeas, type Idea } from '../lib/suggest'
  import { loadWants, wants } from '../lib/wants.svelte'
  import { history, loadHistory, notNow } from '../lib/suggestions.svelte'
  import type { Day } from '../lib/types'

  let { start: requested }: { start: Day } = $props()

  const startDay = $derived(app.household?.weekStartDay ?? 0)
  const start = $derived(weekStart(requested, startDay))
  const days = $derived(weekDays(start))
  const isThisWeek = $derived(start === weekStart(today(), startDay))
  const todayDay = today()
  const entries = $derived(plan.weeks[start] ?? [])
  const freeNights = $derived(days.filter((d) => d >= todayDay && !entries.some((e) => e.date === d)))

  $effect(() => {
    void loadMeals()
    void loadWeek(start)
    void loadFreezer()
    void loadHistory()
    void loadWants()
  })

  const ideas = $derived(
    rankIdeas({ meals: meals.list, history, freezer: freezer.items, members: app.household?.members ?? [], today: todayDay, planned: entries, wants: wants.list }),
  )

  const FILTERS = [
    { id: 'all', label: 'Best' },
    { id: 'both', label: 'You both love' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'veggie', label: 'Veggie' },
    { id: 'freezer', label: 'Freezer' },
    { id: 'try', label: 'To try' },
    { id: 'quick', label: 'Quick' },
  ] as const
  type Filter = (typeof FILTERS)[number]['id']
  let filter = $state<Filter>('all')
  const matches = (i: Idea, f: Filter) =>
    f === 'all' ||
    (f === 'both' && i.bothLike) ||
    (f === 'overdue' && i.overdue) ||
    (f === 'veggie' && i.veggie) ||
    (f === 'freezer' && Boolean(i.freezerItemId)) ||
    (f === 'try' && (i.wanted || i.isNew)) ||
    (f === 'quick' && i.effort === 1)
  let limit = $state(12)
  const shown = $derived(ideas.filter((i) => matches(i, filter)).slice(0, limit))
  const total = $derived(ideas.filter((i) => matches(i, filter)).length)

  let busy = $state<string | null>(null)
  let notice = $state('')

  async function add(i: Idea, date: Day): Promise<void> {
    busy = i.mealId
    notice = ''
    try {
      if (i.freezerItemId) await setNight(start, date, { kind: 'freezer', freezerItemId: i.freezerItemId })
      else await setNight(start, date, { kind: 'dish', dishId: i.mealId, optionIds: i.optionIds })
      notice = `${i.title} added to ${weekdayName(date)}.`
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      busy = null
    }
  }

  async function later(i: Idea): Promise<void> {
    busy = i.mealId
    try {
      await notNow(i.mealId)
      notice = `${i.title}: not suggested for three weeks.`
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      busy = null
    }
  }

  async function never(i: Idea): Promise<void> {
    busy = i.mealId
    try {
      await api.updateMeal(i.mealId, { neverSuggest: true })
      await loadMeals(true)
      notice = `${i.title} won't be suggested again. Turn it back on from its meal page.`
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      busy = null
    }
  }

  const EFFORT = { 1: 'Quick', 2: 'Some effort', 3: 'A project' } as const
</script>

<section aria-labelledby="ideas-title">
  <header class="head">
    <div>
      <h1 id="ideas-title">Ideas</h1>
      <p class="muted range">For {isThisWeek ? 'this week' : weekLabel(start)}{isThisWeek ? `, ${weekLabel(start)}` : ''}</p>
    </div>
    <nav class="pager" aria-label="Weeks">
      <a class="btn btn-icon" href={`#/ideas/${previousWeek(start, startDay)}`} aria-label="Previous week"><Chevron dir="left" /></a>
      <a class="btn btn-icon" href={`#/ideas/${addDays(start, 7)}`} aria-label="Next week"><Chevron /></a>
    </nav>
  </header>

  <p class="free">
    {#if freeNights.length}
      Free nights: {freeNights.map((d) => weekdayName(d)).join(', ')}.
    {:else}
      Every night this week is planned. <a href={`#/ideas/${addDays(start, 7)}`}>Next week</a>
    {/if}
  </p>

  <div class="filters" role="group" aria-label="Show">
    {#each FILTERS as f (f.id)}
      <button type="button" class="filter" aria-pressed={filter === f.id} onclick={() => ((filter = f.id), (limit = 12))}>{f.label}</button>
    {/each}
  </div>

  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  {#if !shown.length}
    <p class="muted">Nothing here right now.</p>
  {/if}

  <ol class="list">
    {#each shown as i (i.mealId)}
      <li>
        <article class="idea" aria-labelledby={`idea-${i.mealId}`}>
          <h2 id={`idea-${i.mealId}`}><a href={`#/meals/${i.mealId}`}>{i.title}</a></h2>
          <p class="headline">{i.headline}</p>
          <ul class="facts">
            {#each i.facts as f (f)}<li>{f}</li>{/each}
          </ul>
          <p class="traits muted">
            {#if i.effort}<span>{EFFORT[i.effort]}</span>{/if}
            {#if i.veggie}<span>Veggie</span>{/if}
            {#each i.tags.slice(0, 4) as t (t)}<span>{t}</span>{/each}
          </p>
          {#if freeNights.length}
            <div class="add" role="group" aria-label={`Add ${i.title} to`}>
              {#each freeNights as d (d)}
                <button type="button" class={`night day-${weekdayIndex(d)}`} disabled={busy === i.mealId} aria-label={`Add ${i.title} to ${weekdayName(d)} ${shortDate(d)}`} onclick={() => void add(i, d)}>
                  {weekdayName(d)}
                </button>
              {/each}
            </div>
          {/if}
          <div class="acts">
            <button type="button" class="link" disabled={busy === i.mealId} onclick={() => void later(i)}>Not now</button>
            <button type="button" class="link" disabled={busy === i.mealId} onclick={() => void never(i)}>Never suggest</button>
          </div>
        </article>
      </li>
    {/each}
  </ol>
  {#if total > shown.length}
    <button type="button" class="btn more" onclick={() => (limit += 12)}>Show more ({total - shown.length})</button>
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
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
  .free {
    margin: 0 0 0.75rem;
    font-weight: 600;
  }
  .free a {
    color: var(--plum);
  }
  .filters {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 -1rem 0.75rem;
    padding: 0 1rem 2px;
  }
  .filters::-webkit-scrollbar {
    display: none;
  }
  .filter {
    flex-shrink: 0;
    min-height: 38px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--plum);
    font: inherit;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }
  .filter[aria-pressed='true'] {
    background: var(--plum);
    border-color: var(--plum);
    color: var(--on-accent);
  }
  .notice {
    margin: 0 0 0.75rem;
    font-size: var(--s-1);
    font-weight: 650;
    color: var(--leek);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .idea {
    display: grid;
    gap: 0.45rem;
    padding: 0.9rem 1rem;
    border-radius: var(--r-row);
    border: 1px solid var(--rule);
    background: var(--plate);
  }
  h2 {
    font-size: var(--s2);
    line-height: 1.1;
  }
  h2 a {
    color: var(--plum);
    text-decoration: none;
  }
  .headline {
    margin: 0;
    font-weight: 700;
    color: var(--leek);
  }
  .facts {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.15rem;
    font-size: var(--s-1);
    color: var(--pepper);
  }
  .traits {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0;
    font-size: var(--s-1);
  }
  .traits span {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--rule);
  }
  /* One row of the free nights, in their colours. */
  .add {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.25rem;
  }
  .night {
    min-height: 40px;
    min-width: 0;
    padding: 0;
    border-left-width: 3px;
    border-radius: var(--r-row);
    border: 0;
    border-left: 4px solid var(--day);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
    color: var(--plum);
    font: inherit;
    font-weight: 700;
    font-stretch: 85%;
    cursor: pointer;
  }
  .acts {
    display: flex;
    gap: 1.25rem;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--pepper);
    font: inherit;
    font-size: var(--s-1);
    font-weight: 650;
    text-decoration: underline;
    cursor: pointer;
  }
  .more {
    margin-top: 0.75rem;
    width: 100%;
  }
</style>
