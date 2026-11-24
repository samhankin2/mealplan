<script lang="ts">
  import { untrack } from 'svelte'
  import RatingControl from './RatingControl.svelte'
  import AddPhoto from './AddPhoto.svelte'
  import Photo from './Photo.svelte'
  import { addDays, shortDate, today, weekDays, weekStart, weekdayIndex, weekdayName } from '../lib/dates'
  import { meals, persona, saveMeal } from '../lib/meals.svelte'
  import { describe, searchMeals, setNight } from '../lib/plan.svelte'
  import { opinionOf, reviewCook, updateEntry } from '../lib/review.svelte'
  import { app } from '../lib/state.svelte'
  import type { Day, ReviewEntry } from '../lib/types'

  let { entry, taken }: { entry: ReviewEntry; taken: Set<Day> } = $props()

  let error = $state('')
  let more = $state(false)
  let swapping = $state(false)
  let swapQuery = $state('')
  // A draft of the note: starts from what's saved, then belongs to the input until blur saves it.
  let note = $state(untrack(() => entry.cookNote ?? ''))
  let movedTo = $state<Day | null>(null)

  const meal = $derived(meals.list.find((m) => m.id === entry.dishId))
  const shown = $derived(describe(entry, meals.list))
  const opinion = $derived(opinionOf(entry, persona.value) ?? { thumbs: null, stars: null })
  const isFreezer = $derived(entry.kind === 'freezer')
  const photos = $derived(meal?.photos.filter((p) => p.entryId === entry.id) ?? [])
  // Empty nights from today to the end of this week: where a skipped meal can go.
  const startDay = $derived(app.household?.weekStartDay ?? 0)
  const openNights = $derived(weekDays(weekStart(today(), startDay)).concat(weekDays(addDays(weekStart(today(), startDay), 7))).filter((d) => d >= today() && !taken.has(d)).slice(0, 5))

  async function run(task: () => Promise<unknown>): Promise<void> {
    error = ''
    try {
      await task()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  const setStatus = (status: 'cooked' | 'skipped' | 'planned') => run(() => updateEntry(entry.id, { status }))
  const rate = (v: { thumbs: -1 | 1 | null; stars: number | null }) => run(() => reviewCook(entry.id, persona.value, v))
  const saveNote = () => {
    if ((entry.cookNote ?? '') !== note.trim()) void run(() => updateEntry(entry.id, { cookNote: note.trim() || null }))
  }
  const frozen = (n: number) => run(() => updateEntry(entry.id, { frozenPortions: Math.max(0, Math.min(20, n)) }))
  const swap = (dishId: string) =>
    run(async () => {
      await updateEntry(entry.id, { swapToDishId: dishId })
      swapping = false
      swapQuery = ''
    })
  const moveTo = (date: Day) =>
    run(async () => {
      if (!entry.dishId) return
      await setNight(weekStart(date, startDay), date, { kind: 'dish', dishId: entry.dishId, optionIds: entry.optionIds, raw: entry.raw })
      taken.add(date)
      movedTo = date
    })
</script>

<article class={`review day-${weekdayIndex(entry.date)}`} class:done={entry.status !== 'planned'} aria-labelledby={`rv-${entry.id}`}>
  <header>
    <span class="when muted">{weekdayName(entry.date)} {shortDate(entry.date)}</span>
    <h2 id={`rv-${entry.id}`}>{shown.title}</h2>
    {#if shown.detail}<p class="detail muted">{shown.detail}</p>{/if}
  </header>

  {#if entry.status === 'planned'}
    <div class="choices">
      <button type="button" class="btn btn-primary" onclick={() => void setStatus('cooked')}>{isFreezer ? 'Ate it' : 'Cooked it'}</button>
      <button type="button" class="btn" onclick={() => void setStatus('skipped')}>{isFreezer ? "Didn't" : 'Skipped'}</button>
      {#if !isFreezer}
        <button type="button" class="btn" aria-expanded={swapping} onclick={() => (swapping = !swapping)}>Made something else</button>
      {/if}
    </div>
    {#if swapping}
      <label class="visually-hidden" for={`swap-${entry.id}`}>What did you make?</label>
      <input id={`swap-${entry.id}`} class="search" type="search" placeholder="What did you make?" bind:value={swapQuery} />
      <div class="picks">
        {#each searchMeals(meals.list, swapQuery, 6) as m (m.id)}
          <button type="button" class="pick" onclick={() => void swap(m.id)}>{m.name}</button>
        {/each}
      </div>
    {/if}
  {:else if entry.status === 'skipped'}
    <p class="state muted">{isFreezer ? 'Not eaten. It stays in the freezer.' : 'Skipped.'} <button type="button" class="link" onclick={() => void setStatus('planned')}>Undo</button></p>
    {#if !isFreezer && entry.dishId}
      {#if movedTo}
        <p class="state">Moved to {weekdayName(movedTo)} {shortDate(movedTo)}.</p>
      {:else if openNights.length}
        <p class="muted small">Still want it? Put it on a free night:</p>
        <div class="picks">
          {#each openNights as d (d)}
            <button type="button" class="pick" onclick={() => void moveTo(d)}>{weekdayName(d)} {shortDate(d)}</button>
          {/each}
        </div>
      {/if}
    {/if}
  {:else}
    <div class="rate">
      <RatingControl size="md" label={shown.title} value={opinion} onchange={(v) => void rate(v)} />
      <button type="button" class="link small" onclick={() => void setStatus('planned')}>Undo</button>
    </div>
    {#if meal}
      <div class="effort" role="radiogroup" aria-label={`Effort for ${meal.name}`}>
        <span class="muted">Effort</span>
        {#each [[1, 'Low'], [2, 'Medium'], [3, 'High']] as [value, label] (value)}
          <button type="button" role="radio" aria-checked={meal.effort === value} onclick={() => void run(() => saveMeal(meal.id, { effort: meal.effort === value ? null : (value as 1 | 2 | 3) }))}>{label}</button>
        {/each}
      </div>
    {/if}
    <button type="button" class="link more" aria-expanded={more} onclick={() => (more = !more)}>{more ? 'Less' : 'Note, lunch, freezer, retry…'}</button>
    {#if more}
      <div class="extras">
        <label class="field">
          <span>Cook note</span>
          <input placeholder="e.g. more garlic, used thighs" maxlength="1000" bind:value={note} onblur={saveNote} />
        </label>
        <div class="toggles">
          <button type="button" class="toggle" aria-pressed={entry.leftovers} onclick={() => void run(() => updateEntry(entry.id, { leftovers: !entry.leftovers }))}>Covered a lunch</button>
          <button type="button" class="toggle" aria-pressed={entry.tweakRetry} onclick={() => void run(() => updateEntry(entry.id, { tweakRetry: !entry.tweakRetry }))}>Tweak and retry</button>
        </div>
        {#if meal}
          <div class="pics">
            {#each photos as p (p.id)}<Photo id={p.id} alt={`${meal.name}, ${shortDate(entry.date)}`} size="sm" />{/each}
            <AddPhoto dishId={meal.id} entryId={entry.id} />
          </div>
        {/if}
        {#if !isFreezer}
          <div class="frozen">
            <span>Froze</span>
            <button type="button" class="step" aria-label="One fewer portion" disabled={entry.frozenPortions === 0} onclick={() => void frozen(entry.frozenPortions - 1)}>−</button>
            <strong aria-live="polite">{entry.frozenPortions}</strong>
            <button type="button" class="step" aria-label="One more portion" onclick={() => void frozen(entry.frozenPortions + 1)}>+</button>
            <span class="muted">portion{entry.frozenPortions === 1 ? '' : 's'}</span>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</article>

<style>
  /* A review card wears its night's colour, like the night on the week. */
  .review {
    display: grid;
    gap: 0.75rem;
    padding: 0.9rem 1rem 1rem 0.95rem;
    border-radius: var(--r-row);
    border-left: 6px solid var(--day);
    background: var(--plate);
  }
  .review.done {
    background: color-mix(in srgb, var(--day) var(--tint), var(--plate));
  }
  header {
    display: grid;
    gap: 0.1rem;
  }
  .when {
    font-size: var(--s0);
    font-weight: 760;
    font-stretch: 75%;
  }
  h2 {
    font-size: var(--s2);
    font-stretch: 85%;
  }
  .detail {
    margin: 0;
    font-size: 0.9rem;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .choices .btn {
    flex: 1 1 auto;
  }
  .search {
    min-height: 44px;
    padding: 0 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .pick {
    min-height: 38px;
    padding: 0 0.8rem;
    border-radius: var(--r-row);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .state {
    margin: 0;
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
  }
  .rate {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }
  .more {
    justify-self: start;
  }
  .effort {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .effort > span {
    font-size: 0.85rem;
    margin-right: 0.15rem;
  }
  .effort button,
  .toggle {
    flex: 1;
    min-height: 36px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .effort button[aria-checked='true'],
  .toggle[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .extras {
    display: grid;
    gap: 0.7rem;
  }
  .toggles {
    display: flex;
    gap: 0.4rem;
  }
  .pics {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .frozen {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .step {
    width: 40px;
    height: 40px;
    border-radius: var(--r-row);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-size: 1.3rem;
    cursor: pointer;
  }
  .step:disabled {
    opacity: 0.4;
  }
</style>
