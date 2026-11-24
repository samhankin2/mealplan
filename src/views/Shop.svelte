<script lang="ts">
  import { onMount } from 'svelte'
  import { shortDate, weekLabel, weekStart, weekdayName } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import {
    SECTION_NAMES,
    SECTION_ORDER,
    addItem,
    asText,
    clearTicked,
    loadShop,
    mealLabel,
    nightsFor,
    removeItem,
    setSection,
    shop,
    tick,
    watchShop,
  } from '../lib/shop.svelte'
  import { app } from '../lib/state.svelte'
  import type { Day, Section, ShoppingItem } from '../lib/types'

  let { week: requested }: { week: Day } = $props()

  const week = $derived(weekStart(requested, app.household?.weekStartDay ?? 0))
  let mode = $state<'build' | 'list'>('build')
  let step = $state(0)
  let typed = $state('')
  let extra = $state('')
  let error = $state('')
  let notice = $state('')
  let skipUsual = $state<Set<string>>(new Set()) // usual items unticked for this step

  onMount(() => void loadMeals())
  $effect(() => {
    void loadShop(week)
    return watchShop(week)
  })
  // A different week starts the builder over.
  let shownWeek = ''
  $effect(() => {
    if (week !== shownWeek) {
      shownWeek = week
      step = 0
      mode = 'build'
      skipUsual = new Set()
    }
  })

  const data = $derived(shop.data && shop.data.week === week ? shop.data : null)
  const nights = $derived(data?.nights ?? [])
  const steps = $derived(nights.length + 1) // every meal night, then extras
  const night = $derived(step < nights.length ? nights[step] : null)
  const meal = $derived(night ? meals.list.find((m) => m.id === night.dishId) : null)
  // Already on the list for this meal, and the usual items not yet on it.
  const forMeal = $derived(night && data ? data.items.filter((i) => i.dishIds.includes(night.dishId)) : [])
  const usual = $derived(
    night && data
      ? (data.usual[night.dishId] ?? []).filter((u) => !forMeal.some((i) => i.name.toLowerCase() === u.name.toLowerCase()))
      : [],
  )
  const extras = $derived(data ? data.items.filter((i) => i.dishIds.length === 0) : [])
  const bySection = $derived(
    SECTION_ORDER.map((section) => ({
      section,
      items: (data?.items ?? [])
        .filter((i) => i.section === section)
        .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length),
  )
  const left = $derived((data?.items ?? []).filter((i) => !i.checked).length)

  async function run(task: () => Promise<unknown>): Promise<void> {
    error = ''
    try {
      await task()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  function go(to: number): void {
    step = Math.max(0, Math.min(steps - 1, to))
    skipUsual = new Set()
    typed = ''
  }

  const addTyped = (dishId: string | null, text: string, done: () => void) =>
    run(async () => {
      if (!text.trim()) return
      await addItem(week, text, dishId)
      done()
    })

  const addUsual = () =>
    run(async () => {
      if (!night) return
      for (const u of usual.filter((x) => !skipUsual.has(x.name))) await addItem(week, u.qty ? `${u.qty} ${u.name}` : u.name, night.dishId)
    })

  const nextSection = (s: Section): Section => SECTION_ORDER[(SECTION_ORDER.indexOf(s) + 1) % SECTION_ORDER.length]

  async function copy(): Promise<void> {
    if (!data) return
    try {
      await navigator.clipboard.writeText(asText(data))
      notice = 'Copied. Paste it anywhere.'
    } catch {
      notice = "Couldn't copy on this device."
    }
  }
</script>

<div class="head">
  <a class="back muted" href={`#/week/${week}`}>‹ Week</a>
  <h1>Shopping</h1>
</div>
<p class="muted sub">{weekLabel(week)}</p>

<div class="tabs" role="tablist" aria-label="Shopping">
  <button type="button" role="tab" aria-selected={mode === 'build'} onclick={() => (mode = 'build')}>Build</button>
  <button type="button" role="tab" aria-selected={mode === 'list'} onclick={() => (mode = 'list')}>List{data ? ` · ${left}` : ''}</button>
</div>

{#if shop.error}<p class="error" role="alert">{shop.error}</p>{/if}

{#if !data}
  <p class="muted">Loading…</p>
{:else if mode === 'build'}
  <p class="progress muted">{step + 1} of {steps}</p>
  {#if night}
    <section class="card step" aria-labelledby="step-title">
      <p class="when muted">{weekdayName(night.date)} {shortDate(night.date)}</p>
      <h2 id="step-title">{mealLabel(meals.list, night.dishId, night.optionIds)}</h2>
      {#if meal?.tips}<p class="tips">Tip: {meal.tips}</p>{/if}

      {#if usual.length}
        <div class="usual">
          <p class="label">The usual <span class="muted">(untick what you've got)</span></p>
          <div class="chips">
            {#each usual as u (u.name)}
              <button
                type="button"
                class="chip"
                aria-pressed={!skipUsual.has(u.name)}
                onclick={() => (skipUsual = skipUsual.has(u.name) ? new Set([...skipUsual].filter((x) => x !== u.name)) : new Set([...skipUsual, u.name]))}
                >{u.qty ? `${u.qty} ` : ''}{u.name}</button>
            {/each}
          </div>
          <button type="button" class="btn" disabled={usual.every((u) => skipUsual.has(u.name))} onclick={() => void addUsual()}>
            Add {usual.filter((u) => !skipUsual.has(u.name)).length} to the list
          </button>
        </div>
      {/if}

      <form class="add" onsubmit={(e) => { e.preventDefault(); void addTyped(night.dishId, typed, () => (typed = '')) }}>
        <label class="visually-hidden" for="add-item">Add an item for this meal</label>
        <input id="add-item" placeholder="e.g. 2 onions, coriander" autocomplete="off" bind:value={typed} />
        <button class="btn btn-primary" type="submit" disabled={!typed.trim()}>Add</button>
      </form>

      {#if forMeal.length}
        <ul class="added">
          {#each forMeal as i (i.id)}
            <li>
              <span>{i.name}{i.qty ? ` (${i.qty})` : ''} <span class="sec muted">{SECTION_NAMES[i.section]}</span></span>
              <button type="button" class="x" aria-label={`Remove ${i.name} for this meal`} onclick={() => void run(() => removeItem(i, night.dishId))}>×</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <section class="card step" aria-labelledby="step-title">
      <h2 id="step-title">Extras</h2>
      <p class="muted small">Milk, bread, snacks, household: anything not for a meal.</p>
      <form class="add" onsubmit={(e) => { e.preventDefault(); void addTyped(null, typed, () => (typed = '')) }}>
        <label class="visually-hidden" for="add-item">Add an extra</label>
        <input id="add-item" placeholder="e.g. milk, toilet paper" autocomplete="off" bind:value={typed} />
        <button class="btn btn-primary" type="submit" disabled={!typed.trim()}>Add</button>
      </form>
      {#if extras.length}
        <ul class="added">
          {#each extras as i (i.id)}
            <li>
              <span>{i.name}{i.qty ? ` (${i.qty})` : ''} <span class="sec muted">{SECTION_NAMES[i.section]}</span></span>
              <button type="button" class="x" aria-label={`Remove ${i.name}`} onclick={() => void run(() => removeItem(i))}>×</button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if nights.length === 0}<p class="muted small">No meal nights planned this week, so it's straight to extras.</p>{/if}
    </section>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="nav">
    <button class="btn" type="button" disabled={step === 0} onclick={() => go(step - 1)}>‹ Back</button>
    {#if step < steps - 1}
      <button class="btn btn-primary" type="button" onclick={() => go(step + 1)}>Next ›</button>
    {:else}
      <button class="btn btn-primary" type="button" onclick={() => (mode = 'list')}>See the list ›</button>
    {/if}
  </div>
{:else}
  <form class="add quick" onsubmit={(e) => { e.preventDefault(); void addTyped(null, extra, () => (extra = '')) }}>
    <label class="visually-hidden" for="quick-add">Add something</label>
    <input id="quick-add" placeholder="Add something…" autocomplete="off" bind:value={extra} />
    <button class="btn" type="submit" disabled={!extra.trim()}>Add</button>
  </form>
  {#if bySection.length === 0}
    <p class="muted">Nothing on the list yet. Build it night by night, or add things here.</p>
  {/if}
  {#each bySection as group (group.section)}
    <section class="group" aria-labelledby={`sec-${group.section}`}>
      <h2 id={`sec-${group.section}`}>{SECTION_NAMES[group.section]}</h2>
      <ul class="items">
        {#each group.items as i (i.id)}
          {@const nightsText = nightsFor(i, data, weekdayName)}
          <li class:done={i.checked}>
            <label class="item">
              <input type="checkbox" checked={i.checked} onchange={(e) => void run(() => tick(i, (e.currentTarget as HTMLInputElement).checked))} />
              <span class="what">
                <span class="name">{i.name}{i.qty ? ` (${i.qty})` : ''}{shop.pending.has(i.id) ? ' ⏳' : ''}</span>
                {#if nightsText}<span class="muted small">{nightsText}</span>{/if}
              </span>
            </label>
            <button type="button" class="sec-btn" aria-label={`${i.name}: ${SECTION_NAMES[i.section]}, move to ${SECTION_NAMES[nextSection(i.section)]}`} onclick={() => void run(() => setSection(i as ShoppingItem, nextSection(i.section)))}>{SECTION_NAMES[i.section].slice(0, 1)}</button>
            <button type="button" class="x" aria-label={`Remove ${i.name}`} onclick={() => void run(() => removeItem(i))}>×</button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="muted small" role="status">{notice}</p>{/if}
  {#if data.items.length}
    <div class="nav">
      <button class="btn" type="button" onclick={() => void copy()}>Copy as text</button>
      <button class="btn" type="button" disabled={!data.items.some((i) => i.checked)} onclick={() => void run(async () => (notice = `Cleared ${await clearTicked(week)} ticked.`))}>Clear ticked</button>
    </div>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  .back {
    text-decoration: none;
    font-weight: 600;
  }
  h1 {
    font-size: 1.6rem;
  }
  .sub {
    margin: 0.1rem 0 0.75rem;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: 999px;
    background: var(--surface-sunken);
    margin-bottom: 0.75rem;
  }
  .tabs button {
    min-height: 40px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font-weight: 700;
    cursor: pointer;
  }
  .tabs button[aria-selected='true'] {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .progress {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .step {
    display: grid;
    gap: 0.7rem;
    padding: 1rem;
  }
  .when {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .step h2 {
    font-size: 1.4rem;
  }
  .tips {
    margin: 0;
    color: var(--herb);
    font-weight: 600;
  }
  .usual {
    display: grid;
    gap: 0.5rem;
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
  }
  .label {
    margin: 0;
    font-weight: 700;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    min-height: 36px;
    padding: 0 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text-muted);
    font-weight: 600;
    cursor: pointer;
    text-decoration: line-through;
  }
  .chip[aria-pressed='true'] {
    background: var(--herb-soft);
    border-color: var(--herb);
    color: var(--herb);
    text-decoration: none;
  }
  .usual .btn {
    justify-self: start;
  }
  .add {
    display: flex;
    gap: 0.5rem;
  }
  .add input {
    flex: 1;
    min-width: 0;
    min-height: 46px;
    padding: 0 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--bg);
  }
  .quick {
    margin-bottom: 0.75rem;
  }
  .added {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .added li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.2rem 0.3rem 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
  }
  .sec {
    font-size: 0.8rem;
  }
  .x {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 1.3rem;
    cursor: pointer;
  }
  .nav {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.85rem;
  }
  .group {
    margin-bottom: 1rem;
  }
  .group h2 {
    font-size: 1.15rem;
    margin-bottom: 0.35rem;
    color: var(--accent);
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.2rem 0.2rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .items li.done {
    opacity: 0.5;
  }
  .items li.done .name {
    text-decoration: line-through;
  }
  .item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: 48px;
    cursor: pointer;
    min-width: 0;
  }
  .item input {
    width: 24px;
    height: 24px;
    flex: none;
    accent-color: var(--herb);
  }
  .what {
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
  }
  .sec-btn {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-weight: 700;
    cursor: pointer;
  }
</style>
