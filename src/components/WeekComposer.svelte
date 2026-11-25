<script lang="ts">
  /**
   * One line at a time: an input docked on the keyboard, labelled with the
   * night it fills. Return saves that night and moves to the next; suggestions
   * for what you're typing sit in a strip just above it.
   */
  import { onMount } from 'svelte'
  import { api } from '../lib/api'
  import { weekDays, weekdayIndex, weekdayName } from '../lib/dates'
  import { axes, loadMeals, meals } from '../lib/meals.svelte'
  import { clearNight, entryFor, searchMeals, setNight } from '../lib/plan.svelte'
  import { freezer, freezerLabel } from '../lib/review.svelte'
  import { forNight, type Suggestion } from '../lib/suggest'
  import type { Day, Meal, NightKind } from '../lib/types'

  let {
    start,
    selected = $bindable(),
    ideas,
    onmore,
  }: { start: Day; selected: Day | null; ideas: Suggestion[]; onmore: (day: Day) => void } = $props()

  let query = $state('')
  let busy = $state(false)
  let error = $state('')
  let input: HTMLInputElement | undefined = $state()
  let keyboard = $state(0) // px of screen the on-screen keyboard covers

  const days = $derived(weekDays(start))
  const day = $derived(selected ?? days[0])
  const entry = $derived(entryFor(start, day))
  const meal = $derived(entry?.kind === 'dish' && entry.dishId ? meals.list.find((m) => m.id === entry.dishId) : undefined)
  const optionGroups = $derived(
    meal ? axes(meal).map((g) => ({ ...g, options: g.options.filter((o) => !meal.hidden?.includes(o.id)) })).filter((g) => g.options.length) : [],
  )
  const typed = $derived(query.trim())
  const results = $derived(typed ? searchMeals(meals.list, typed, 6) : [])
  const exact = $derived(meals.list.some((m) => m.name.toLowerCase() === typed.toLowerCase()))
  const nightIdeas = $derived(typed ? [] : forNight(ideas, meals.list, day, 3))
  // Freezer stock not already among the ideas.
  const frozen = $derived(freezer.items.filter((f) => !nightIdeas.some((s) => s.freezerItemId === f.id)).slice(0, 2))

  /** Called straight from a tap, so phones raise the keyboard. */
  export function focus(): void {
    input?.focus({ preventScroll: true })
  }

  onMount(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = (): void => {
      keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    }
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    fit()
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  })

  // A different night: start its line afresh.
  $effect(() => {
    void selected
    query = ''
    error = ''
  })

  function close(): void {
    input?.blur()
    selected = null
  }

  /** The next line. After Sunday, done. */
  function next(): void {
    const i = days.indexOf(day)
    if (i >= 6) close()
    else selected = days[i + 1]
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
    }
  }

  const hasOptions = (m: Meal) => axes(m).some((g) => g.options.some((o) => !m.hidden?.includes(o.id)))

  /** A meal: saved. With options to choose, stay on this night for them; otherwise on to the next. */
  const pickMeal = (m: Meal, optionIds: string[] = []) =>
    run(async () => {
      const at = day
      await setNight(start, at, { kind: 'dish', dishId: m.id, optionIds })
      query = ''
      if (!hasOptions(m) || optionIds.length) next()
    })

  const pickIdea = (s: Suggestion) => {
    if (s.freezerItemId) return void pickFreezer(s.freezerItemId)
    const m = meals.list.find((x) => x.id === s.mealId)
    if (m) void pickMeal(m, s.optionIds ?? [])
  }

  const pickKind = (kind: NightKind) =>
    run(async () => {
      await setNight(start, day, { kind })
      query = ''
      next()
    })

  const pickFreezer = (freezerItemId: string) =>
    run(async () => {
      await setNight(start, day, { kind: 'freezer', freezerItemId })
      next()
    })

  const newMeal = () =>
    run(async () => {
      const name = typed
      const { meal: created } = await api.createMeal(name)
      await loadMeals(true)
      await setNight(start, day, { kind: 'dish', dishId: created.id, raw: name })
      query = ''
      next()
    })

  /** One option per axis; once every axis has one, on to the next night. */
  const toggleOption = (axis: string, id: string) =>
    run(async () => {
      if (!entry || !meal) return
      const byAxis = new Map(meal.options.filter((o) => entry.optionIds.includes(o.id)).map((o) => [o.axis, o.id]))
      const complete = (m: Map<string, string>) => optionGroups.every((g) => m.has(g.axis))
      const was = complete(byAxis)
      if (byAxis.get(axis) === id) byAxis.delete(axis)
      else byAxis.set(axis, id)
      await setNight(start, day, { kind: 'dish', dishId: meal.id, optionIds: [...byAxis.values()], note: entry.note })
      if (!was && complete(byAxis)) next()
    })

  const clear = () => run(() => clearNight(start, day))

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') return close()
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (busy) return
    if (!typed) return next() // an empty Return: leave this night as it is
    if (results[0]) void pickMeal(results[0])
    else void newMeal()
  }

  // Tapping a chip mustn't take focus from the input (the keyboard would drop).
  const keep = (e: PointerEvent) => e.preventDefault()
</script>

<div class="composer" class:open={selected !== null} style={`bottom: ${keyboard}px`} aria-hidden={selected === null}>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="chips" role="group" aria-label="Suggestions">
    {#if typed}
      {#each results as m (m.id)}
        <button type="button" class="chip" disabled={busy} onpointerdown={keep} onclick={() => void pickMeal(m)}>{m.name}</button>
      {/each}
      {#if !exact}
        <button type="button" class="chip new" disabled={busy} onpointerdown={keep} onclick={() => void newMeal()}>New: {typed}</button>
      {/if}
    {:else}
      {#if optionGroups.length && entry?.kind === 'dish'}
        {#each optionGroups as g (g.axis)}
          {#each g.options as o (o.id)}
            <button type="button" class="chip option" aria-pressed={entry.optionIds.includes(o.id)} disabled={busy} onpointerdown={keep} onclick={() => void toggleOption(g.axis, o.id)}>{o.name}</button>
          {/each}
        {/each}
      {/if}
      {#each nightIdeas as s (s.lane + s.mealId)}
        <button type="button" class="chip idea" disabled={busy} onpointerdown={keep} onclick={() => pickIdea(s)}>{s.freezerItemId ? `Freezer: ${s.title}` : s.title}</button>
      {/each}
      {#each frozen as f (f.id)}
        <button type="button" class="chip" disabled={busy} onpointerdown={keep} onclick={() => void pickFreezer(f.id)}>Freezer: {freezerLabel(f, meals.list)}</button>
      {/each}
      <button type="button" class="chip" disabled={busy} onpointerdown={keep} onclick={() => void pickKind('out')}>Out</button>
      <button type="button" class="chip" disabled={busy} onpointerdown={keep} onclick={() => void pickKind('leftovers')}>Leftovers</button>
      <button type="button" class="chip" disabled={busy} onpointerdown={keep} onclick={() => void pickKind('takeaway')}>Takeaway</button>
      {#if entry}
        <button type="button" class="chip quiet" disabled={busy} onpointerdown={keep} onclick={() => onmore(day)}>Note, move</button>
        <button type="button" class="chip quiet" disabled={busy} onpointerdown={keep} onclick={() => void clear()}>Clear {weekdayName(day)}</button>
      {/if}
    {/if}
  </div>
  <div class={`bar day-${weekdayIndex(day)}`}>
    <label class="tag" for="night-line">{weekdayName(day)}</label>
    <input
      id="night-line"
      bind:this={input}
      bind:value={query}
      onkeydown={onKey}
      placeholder={entry ? 'Change it, or Return for next' : "What's for dinner?"}
      autocomplete="off"
      autocapitalize="sentences"
      enterkeyhint="next"
      tabindex={selected === null ? -1 : 0} />
    <button type="button" class="done" onpointerdown={keep} onclick={close}>Done</button>
  </div>
</div>

<style>
  /* Docked on the keyboard (or the bottom of the screen when it's down). */
  .composer {
    position: fixed;
    z-index: 20;
    left: 0;
    right: 0;
    max-width: 640px;
    margin: 0 auto;
    padding: 0.5rem 0.6rem calc(0.5rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 0.45rem;
    background: color-mix(in srgb, var(--rule) 70%, var(--enamel));
    border-top: 1px solid var(--rule-strong);
    transform: translateY(calc(100% + 2rem));
    opacity: 0;
    pointer-events: none;
  }
  .composer.open {
    transform: none;
    opacity: 1;
    pointer-events: auto;
  }
  .error {
    margin: 0 0.2rem;
    font-size: var(--s-1);
  }
  .chips {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 1px;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex-shrink: 0;
    min-height: 38px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--rule-strong);
    background: var(--plate);
    color: var(--plum);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }
  .chips .chip:first-child:not(.option):not(.quiet) {
    background: var(--plum);
    border-color: var(--plum);
    color: var(--on-accent);
  }
  .chip.new {
    border-style: dashed;
    background: transparent;
  }
  .chip.option[aria-pressed='true'] {
    background: var(--plum);
    border-color: var(--plum);
    color: var(--on-accent);
  }
  .chip.quiet {
    background: transparent;
    color: var(--pepper);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 52px;
    padding: 0 0.4rem 0 0.5rem;
    border-radius: 14px;
    border: 2px solid var(--plum);
    background: var(--plate);
  }
  .tag {
    flex-shrink: 0;
    padding: 0.2rem 0.55rem;
    border-radius: 8px;
    background: var(--day);
    color: #fff;
    font-weight: 760;
    font-stretch: 78%;
    font-size: var(--s1);
  }
  .bar input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font: inherit;
    font-size: 1.125rem; /* 18px: no zoom on focus on iOS */
    color: var(--plum);
  }
  .done {
    flex-shrink: 0;
    min-height: 40px;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--pepper);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
</style>
