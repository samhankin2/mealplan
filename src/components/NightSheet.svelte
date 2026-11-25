<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { api } from '../lib/api'
  import { shortDate, weekDays, weekdayIndex, weekdayName } from '../lib/dates'
  import { axes, loadMeals, meals } from '../lib/meals.svelte'
  import { clearNight, entryFor, moveNight, searchMeals, setNight } from '../lib/plan.svelte'
  import { freezer, freezerLabel, loadFreezer } from '../lib/review.svelte'
  import { forNight, suggestAll, type Suggestion } from '../lib/suggest'
  import { history } from '../lib/suggestions.svelte'
  import { plan } from '../lib/plan.svelte'
  import { app } from '../lib/state.svelte'
  import { today } from '../lib/dates'
  import { onMount } from 'svelte'

  onMount(() => void loadFreezer())
  import type { Day, Meal, NightKind, PlanEntry } from '../lib/types'

  let { start, date, entry, onclose }: { start: Day; date: Day; entry: PlanEntry | undefined; onclose: () => void } = $props()

  let query = $state('')
  let chosen = $state<Meal | null>(null)
  let options = $state<Record<string, string>>({}) // axis -> option id
  let note = $state('')
  let busy = $state(false)
  let error = $state('')

  // Start from what's planned.
  $effect.pre(() => {
    if (entry?.kind === 'dish' && entry.dishId && !chosen) {
      const meal = meals.list.find((m) => m.id === entry.dishId)
      if (meal) {
        chosen = meal
        for (const o of meal.options) if (entry.optionIds.includes(o.id)) options[o.axis] = o.id
      }
    }
    if (entry && !note) note = entry.note ?? ''
  })

  const results = $derived(searchMeals(meals.list, query))
  const exact = $derived(meals.list.some((m) => m.name.toLowerCase() === query.trim().toLowerCase()))
  // Variations we've never had stay out of the way.
  const visibleAxes = $derived(
    chosen ? axes(chosen).map((g) => ({ ...g, options: g.options.filter((o) => !chosen!.hidden?.includes(o.id)) })).filter((g) => g.options.length) : [],
  )

  async function run(task: () => Promise<void>): Promise<void> {
    busy = true
    error = ''
    try {
      await task()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  function pick(meal: Meal): void {
    chosen = meal
    options = {}
  }

  function toggleOption(axis: string, id: string): void {
    options = { ...options, [axis]: options[axis] === id ? '' : id }
  }

  const saveMeal = () =>
    run(async () => {
      if (!chosen) return
      await setNight(start, date, {
        kind: 'dish',
        dishId: chosen.id,
        optionIds: Object.values(options).filter(Boolean),
        note: note.trim() || null,
      })
    })

  const saveKind = (kind: NightKind) => run(async () => void (await setNight(start, date, { kind, note: note.trim() || null })))

  const createAndPick = () =>
    run(async () => {
      const name = query.trim()
      const { meal } = await api.createMeal(name)
      await loadMeals(true)
      await setNight(start, date, { kind: 'dish', dishId: meal.id, raw: name, note: note.trim() || null })
    })

  const clear = () => run(() => clearNight(start, date))
  // The same as dragging, without the drag: onto an empty night moves, onto a planned one swaps.
  const moveTo = (to: Day) => run(() => moveNight(start, date, to))

  // The best few ideas for this particular night (weeknights skip high-effort meals).
  const ideas = $derived(
    forNight(
      // Freezer stock has its own row below, so it isn't repeated here.
      suggestAll({ meals: meals.list, history, freezer: [], members: app.household?.members ?? [], today: today(), planned: plan.weeks[start] ?? [] }),
      meals.list,
      date,
    ),
  )
  const useIdea = (s: Suggestion) =>
    run(async () => {
      if (s.freezerItemId) await setNight(start, date, { kind: 'freezer', freezerItemId: s.freezerItemId })
      else await setNight(start, date, { kind: 'dish', dishId: s.mealId, optionIds: s.optionIds ?? [] })
    })

  const fromFreezer = (freezerItemId: string) => run(async () => void (await setNight(start, date, { kind: 'freezer', freezerItemId })))
</script>

<Sheet title={`${weekdayName(date)} ${shortDate(date)}`} day={weekdayIndex(date)} {onclose}>
  {#if chosen}
    <div class="chosen">
      <p class="meal-name">{chosen.name}</p>
      <button type="button" class="link" onclick={() => (chosen = null)}>Change</button>
    </div>
    {#each visibleAxes as group (group.axis)}
      <p class="axis muted">{group.axis} <span>(optional)</span></p>
      <div class="chips" role="group" aria-label={group.axis}>
        {#each group.options as o (o.id)}
          <button type="button" class="chip" aria-pressed={options[group.axis] === o.id} onclick={() => toggleOption(group.axis, o.id)}>{o.name}</button>
        {/each}
      </div>
    {/each}
    <label class="field note">
      <span>Note</span>
      <input placeholder="e.g. double batch for lunches" maxlength="500" bind:value={note} />
    </label>
    <button class="btn btn-primary wide" type="button" disabled={busy} onclick={() => void saveMeal()}>Save</button>
  {:else}
    <div class="kinds">
      <button type="button" class="kind" onclick={() => void saveKind('out')}>Out</button>
      <button type="button" class="kind" onclick={() => void saveKind('leftovers')}>Leftovers</button>
      <button type="button" class="kind" onclick={() => void saveKind('takeaway')}>Takeaway</button>
    </div>
    {#if ideas.length && !query.trim()}
      <p class="axis muted">Ideas for {weekdayName(date)}</p>
      <ul class="results ideas">
        {#each ideas as s (s.lane + s.mealId)}
          <li>
            <button type="button" class="result idea" onclick={() => void useIdea(s)}>
              <span>{s.lane === 'freezer' ? '❄ ' : ''}{s.title}</span>
              <span class="muted why">{s.reason}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if freezer.items.length && !query.trim()}
      <p class="axis muted">From the freezer</p>
      <div class="chips freezer">
        {#each freezer.items.slice(0, 6) as item (item.id)}
          <button type="button" class="chip" onclick={() => void fromFreezer(item.id)}>❄ {freezerLabel(item, meals.list)} <span class="muted">×{item.portions}</span></button>
        {/each}
      </div>
      <p class="axis muted">Or cook</p>
    {/if}
    <label class="visually-hidden" for="night-search">Find a meal</label>
    <input id="night-search" class="search" type="search" placeholder="Find a meal…" autocomplete="off" bind:value={query} />
    <ul class="results">
      {#each results as meal (meal.id)}
        <li>
          <button type="button" class="result" onclick={() => pick(meal)}>
            <span>{meal.name}</span>
            <span class="muted">{meal.cooked ? `${meal.cooked}×` : ''}</span>
          </button>
        </li>
      {/each}
      {#if query.trim() && !exact}
        <li>
          <button type="button" class="result new" disabled={busy} onclick={() => void createAndPick()}>
            <span>+ New meal: “{query.trim()}”</span>
          </button>
        </li>
      {/if}
    </ul>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if entry}
    <p class="axis muted">Move to</p>
    <div class="move" role="group" aria-label="Move this dinner to">
      {#each weekDays(start).filter((d) => d !== date) as d (d)}
        <button type="button" class={`move-to day-${weekdayIndex(d)}`} class:planned={Boolean(entryFor(start, d))} aria-label={`${entryFor(start, d) ? 'Swap with' : 'Move to'} ${weekdayName(d)}`} onclick={() => void moveTo(d)}>{weekdayName(d)}</button>
      {/each}
    </div>
    <button class="btn wide clear" type="button" disabled={busy} onclick={() => void clear()}>Clear this night</button>
  {/if}
</Sheet>

<style>
  .kinds {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }
  .kind {
    flex: 1;
    min-height: 40px;
    border-radius: var(--r-row);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
  }
  .search {
    width: 100%;
    min-height: 46px;
    padding: 0 0.85rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
  }
  .results {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .result {
    width: 100%;
    min-height: 46px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0.85rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .result.idea {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 0.45rem 0.85rem;
    background: var(--herb-soft);
    border-color: transparent;
  }
  .why {
    font-size: 0.8rem;
    font-weight: 400;
  }
  .ideas {
    margin-bottom: 0.25rem;
  }
  .result.new {
    border-style: dashed;
    color: var(--accent);
  }
  .chosen {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .meal-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }
  .axis {
    margin: 0.85rem 0 0.35rem;
    font-size: 0.85rem;
    font-weight: 700;
      }
  .axis span {
    font-weight: 400;
    letter-spacing: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    min-height: 38px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .note {
    margin-top: 0.85rem;
  }
  .move {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.3rem;
  }
  /* Empty nights are outlined, planned nights tinted (a tap there swaps). */
  .move-to {
    min-height: 40px;
    border-radius: var(--r-row);
    border: 1.5px dashed var(--rule-strong);
    border-left: 4px solid var(--day);
    background: transparent;
    color: var(--plum);
    font-weight: 700;
    font-stretch: 85%;
    cursor: pointer;
  }
  .move-to.planned {
    border-style: solid;
    border-color: transparent;
    border-left-color: var(--day);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
  }
  .wide {
    width: 100%;
    margin-top: 0.85rem;
  }
  .clear {
    color: var(--danger);
  }
</style>
