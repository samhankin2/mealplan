<script lang="ts">
  /**
   * Planning, night by night, built for the keyboard: a strip of the week at
   * the top, one input, and what you can pick right under it. Picking saves
   * and moves to the next empty night; the input keeps focus throughout.
   */
  import { onMount, tick } from 'svelte'
  import NightSheet from './NightSheet.svelte'
  import { api } from '../lib/api'
  import { shortDate, today, weekDays, weekdayIndex, weekdayName } from '../lib/dates'
  import { axes, loadMeals, meals } from '../lib/meals.svelte'
  import { clearNight, describe, entryFor, plan, searchMeals, setNight } from '../lib/plan.svelte'
  import { freezer, freezerLabel, loadFreezer } from '../lib/review.svelte'
  import { forNight, suggestAll, type Suggestion } from '../lib/suggest'
  import { history } from '../lib/suggestions.svelte'
  import { app } from '../lib/state.svelte'
  import type { Day, Meal, NightKind } from '../lib/types'

  let { start, date, onclose }: { start: Day; date: Day; onclose: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let selected = $state<Day>(date)
  let query = $state('')
  let busy = $state(false)
  let error = $state('')
  let more = $state(false)
  let input: HTMLInputElement | undefined = $state()
  let height = $state(0) // the space above the keyboard

  const days = $derived(weekDays(start))
  const entry = $derived(entryFor(start, selected))
  const shown = $derived(entry ? describe(entry, meals.list) : null)
  const meal = $derived(entry?.kind === 'dish' && entry.dishId ? meals.list.find((m) => m.id === entry.dishId) : undefined)
  // Options for the dinner just picked, never-had ones left out.
  const optionGroups = $derived(
    meal ? axes(meal).map((g) => ({ ...g, options: g.options.filter((o) => !meal.hidden?.includes(o.id)) })).filter((g) => g.options.length) : [],
  )
  const results = $derived(query.trim() ? searchMeals(meals.list, query, 6) : [])
  const exact = $derived(meals.list.some((m) => m.name.toLowerCase() === query.trim().toLowerCase()))
  const ideas = $derived(
    query.trim()
      ? []
      : forNight(
          suggestAll({ meals: meals.list, history, freezer: [], members: app.household?.members ?? [], today: today(), planned: plan.weeks[start] ?? [] }),
          meals.list,
          selected,
          4,
        ),
  )
  const planned = $derived(days.filter((d) => entryFor(start, d)).length)

  onMount(() => {
    void loadMeals()
    void loadFreezer()
    // Fit the screen to what's left above the on-screen keyboard.
    const vv = window.visualViewport
    const fit = (): void => {
      height = vv ? vv.height : window.innerHeight
      window.scrollTo(0, 0)
    }
    fit()
    vv?.addEventListener('resize', fit)
    window.addEventListener('resize', fit)
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !more) onclose()
    }
    document.addEventListener('keydown', onKey)
    void tick().then(() => input?.focus())
    return () => {
      vv?.removeEventListener('resize', fit)
      window.removeEventListener('resize', fit)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  })

  function focus(): void {
    input?.focus({ preventScroll: true })
  }

  function select(day: Day): void {
    selected = day
    query = ''
    error = ''
    focus()
  }

  /** On to the next night that's still empty (or simply the next night). */
  function advance(): void {
    const i = days.indexOf(selected)
    const nextEmpty = days.slice(i + 1).find((d) => !entryFor(start, d))
    select(nextEmpty ?? days[Math.min(i + 1, 6)])
  }

  async function run(task: () => Promise<void>): Promise<void> {
    busy = true
    error = ''
    try {
      await task()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
      focus()
    }
  }

  const visibleOptions = (m: Meal) => axes(m).some((g) => g.options.some((o) => !m.hidden?.includes(o.id)))

  /** A meal picked: saved at once. With options, stay so one can be chosen; otherwise move on. */
  const pickMeal = (m: Meal, optionIds: string[] = []) =>
    run(async () => {
      await setNight(start, selected, { kind: 'dish', dishId: m.id, optionIds })
      query = ''
      if (!visibleOptions(m) || optionIds.length) advance()
    })

  const pickIdea = (s: Suggestion) => {
    const m = meals.list.find((x) => x.id === s.mealId)
    if (m) void pickMeal(m, s.optionIds ?? [])
  }

  const pickKind = (kind: NightKind) =>
    run(async () => {
      await setNight(start, selected, { kind })
      query = ''
      advance()
    })

  const pickFreezer = (freezerItemId: string) =>
    run(async () => {
      await setNight(start, selected, { kind: 'freezer', freezerItemId })
      advance()
    })

  const newMeal = () =>
    run(async () => {
      const name = query.trim()
      const { meal: created } = await api.createMeal(name)
      await loadMeals(true)
      await setNight(start, selected, { kind: 'dish', dishId: created.id, raw: name })
      query = ''
      advance()
    })

  /** One option per axis; tapping the chosen one clears it. Saves straight away. */
  const toggleOption = (axis: string, id: string) =>
    run(async () => {
      if (!entry || !meal) return
      const byAxis = new Map(meal.options.filter((o) => entry.optionIds.includes(o.id)).map((o) => [o.axis, o.id]))
      const complete = (m: Map<string, string>) => optionGroups.every((g) => m.has(g.axis))
      const wasComplete = complete(byAxis)
      if (byAxis.get(axis) === id) byAxis.delete(axis)
      else byAxis.set(axis, id)
      await setNight(start, selected, { kind: 'dish', dishId: meal.id, optionIds: [...byAxis.values()], note: entry.note })
      // Every choice made (e.g. Korean and Beef): on to the next night.
      if (!wasComplete && complete(byAxis)) advance()
    })

  const clear = () => run(() => clearNight(start, selected))

  function onEnter(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!query.trim()) return
    if (results[0]) void pickMeal(results[0])
    else void newMeal()
  }
</script>

<div class="planner" role="dialog" aria-modal="true" aria-labelledby="plan-night" style={height ? `height: ${height}px` : ''}>
  <header class="top">
    <button type="button" class="done-btn" onclick={onclose}>Done</button>
    <span class="count muted">{planned} of 7 planned</span>
  </header>

  <!-- The week at a glance; tap a night to plan it. -->
  <ol class="strip" aria-label="Nights">
    {#each days as d (d)}
      {@const e = entryFor(start, d)}
      <li class={`day-${weekdayIndex(d)}`}>
        <button type="button" class="tile" class:filled={Boolean(e)} class:on={d === selected} data-date={d} aria-current={d === selected ? 'true' : undefined} aria-label={`${weekdayName(d)} ${shortDate(d)}${e ? `: ${describe(e, meals.list).title}` : ', empty'}`} onclick={() => select(d)}>
          <span class="tile-day">{weekdayName(d).slice(0, 2)}</span>
        </button>
      </li>
    {/each}
  </ol>

  <section class={`night day-${weekdayIndex(selected)}`} aria-labelledby="plan-night">
    <div class="night-head">
      <h2 id="plan-night">{weekdayName(selected)} <span class="date">{shortDate(selected)}</span></h2>
      {#if entry}
        <span class="night-acts">
          <button type="button" class="link" onclick={() => (more = true)}>More</button>
          <button type="button" class="link" onclick={() => void clear()}>Clear</button>
        </span>
      {/if}
    </div>
    {#if shown}
      <p class="current"><strong>{shown.title}</strong>{#if shown.detail}<span class="muted">, {shown.detail}</span>{/if}</p>
    {/if}
    {#if optionGroups.length && entry?.kind === 'dish'}
      {#each optionGroups as g (g.axis)}
        <div class="opts" role="group" aria-label={g.axis}>
          {#each g.options as o (o.id)}
            <button type="button" class="chip" aria-pressed={entry.optionIds.includes(o.id)} onclick={() => void toggleOption(g.axis, o.id)}>{o.name}</button>
          {/each}
        </div>
      {/each}
    {/if}

    <div class="field-row">
      <label class="visually-hidden" for="plan-input">{entry ? `Change ${weekdayName(selected)}'s dinner` : `Dinner for ${weekdayName(selected)}`}</label>
      <input
        id="plan-input"
        bind:this={input}
        bind:value={query}
        onkeydown={onEnter}
        placeholder={entry ? 'Change it…' : "What's for dinner?"}
        autocomplete="off"
        autocapitalize="sentences"
        enterkeyhint="done" />
      <button type="button" class="next-btn btn" onclick={advance}>Next</button>
    </div>
  </section>

  <!-- Right under the input, above the keyboard. -->
  <div class="picks">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if query.trim()}
      <ul class="list">
        {#each results as m (m.id)}
          <li><button type="button" class="pick" disabled={busy} onclick={() => void pickMeal(m)}><span>{m.name}</span>{#if m.cooked}<span class="muted small">made {m.cooked}×</span>{/if}</button></li>
        {/each}
        {#if !exact}
          <li><button type="button" class="pick new" disabled={busy} onclick={() => void newMeal()}>New meal: {query.trim()}</button></li>
        {/if}
      </ul>
    {:else}
      <div class="kinds">
        <button type="button" class="kind" disabled={busy} onclick={() => void pickKind('out')}>Out</button>
        <button type="button" class="kind" disabled={busy} onclick={() => void pickKind('leftovers')}>Leftovers</button>
        <button type="button" class="kind" disabled={busy} onclick={() => void pickKind('takeaway')}>Takeaway</button>
      </div>
      {#if ideas.length}
        <h3>Ideas for {weekdayName(selected)}</h3>
        <ul class="list">
          {#each ideas as s (s.lane + s.mealId)}
            <li><button type="button" class="pick idea" disabled={busy} onclick={() => pickIdea(s)}><span>{s.title}</span><span class="muted small">{s.reason}</span></button></li>
          {/each}
        </ul>
      {/if}
      {#if freezer.items.length}
        <h3>From the freezer</h3>
        <ul class="list">
          {#each freezer.items.slice(0, 4) as f (f.id)}
            <li><button type="button" class="pick" disabled={busy} onclick={() => void pickFreezer(f.id)}><span>❄ {freezerLabel(f, meals.list)}</span><span class="muted small">{f.portions} left</span></button></li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>

{#if more && entry}
  <NightSheet {start} date={selected} {entry} onclose={() => { more = false; focus() }} />
{/if}

<style>
  /* A screen of its own, sized to the space above the keyboard. */
  .planner {
    position: fixed;
    z-index: 25;
    top: 0;
    left: 0;
    right: 0;
    height: 100dvh;
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    background: var(--enamel);
    padding: calc(0.5rem + env(safe-area-inset-top)) 1rem 0;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .done-btn {
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: var(--r-row);
    border: 0;
    background: var(--plum);
    color: var(--on-accent);
    font-weight: 700;
    cursor: pointer;
  }
  .count {
    font-size: var(--s-1);
    font-weight: 650;
  }
  .strip {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.3rem;
    margin: 0.6rem 0 0.75rem;
    padding: 0;
  }
  .tile {
    width: 100%;
    height: 44px;
    border-radius: 10px;
    border: 1.5px dashed var(--rule-strong);
    background: transparent;
    color: var(--pepper);
    font-weight: 760;
    font-stretch: 80%;
    cursor: pointer;
  }
  .tile.filled {
    border: 0;
    border-bottom: 4px solid var(--day);
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
    color: var(--plum);
  }
  .tile.on {
    outline: 2.5px solid var(--day);
    outline-offset: 2px;
    color: var(--plum);
  }
  .night {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 0.8rem 0.8rem 0.85rem;
    border-radius: var(--r-row);
    border-left: 6px solid var(--day);
    background: var(--plate);
  }
  .night-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }
  h2 {
    font-size: var(--s3);
    font-stretch: 75%;
  }
  .date {
    font-size: var(--s0);
    font-weight: 600;
    color: var(--pepper);
    font-stretch: 100%;
  }
  .night-acts {
    display: flex;
    gap: 0.9rem;
  }
  .current {
    margin: 0;
    font-size: var(--s1);
    line-height: 1.2;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .chip {
    min-height: 36px;
    padding: 0 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--plum);
    font-weight: 650;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    background: var(--plum);
    border-color: var(--plum);
    color: var(--on-accent);
  }
  .field-row {
    display: flex;
    gap: 0.4rem;
  }
  .field-row input {
    flex: 1;
    min-width: 0;
    min-height: 50px;
    padding: 0 0.9rem;
    border-radius: var(--r-row);
    border: 2px solid var(--plum);
    background: var(--enamel);
    font-size: var(--s1); /* 20px: no zoom on iOS, easy to read at arm's length */
  }
  .next-btn {
    min-height: 50px;
  }
  .picks {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.6rem 0 1rem;
    -webkit-overflow-scrolling: touch;
  }
  h3 {
    margin: 0.75rem 0 0.3rem;
    font-size: var(--s-1);
    font-weight: 650;
    color: var(--pepper);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .pick {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.4rem 0.85rem;
    border-radius: var(--r-row);
    border: 1px solid var(--rule);
    background: var(--plate);
    color: var(--plum);
    font-weight: 650;
    font-size: var(--s0);
    text-align: left;
    cursor: pointer;
  }
  .pick.idea {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.05rem;
  }
  .pick.new {
    border-style: dashed;
    border-color: var(--rule-strong);
  }
  .small {
    font-size: var(--s-1);
    font-weight: 500;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }
  .kind {
    min-height: 44px;
    border-radius: var(--r-row);
    border: 1.5px solid var(--rule-strong);
    background: transparent;
    color: var(--plum);
    font-weight: 650;
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
