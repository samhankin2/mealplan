<script lang="ts">
  import Chevron from '../components/Chevron.svelte'
  import { onMount } from 'svelte'
  import NightSheet from '../components/NightSheet.svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import ReviewCard from '../components/ReviewCard.svelte'
  import { addDays, shortDate, today, weekStart, weekdayIndex, weekdayName } from '../lib/dates'
  import { loadMeals } from '../lib/meals.svelte'
  import { loadWeek, plan } from '../lib/plan.svelte'
  import { loadReview, review, reviewCook, updateEntry } from '../lib/review.svelte'
  import { api } from '../lib/api'
  import { persona } from '../lib/meals.svelte'
  import { app } from '../lib/state.svelte'
  import type { Day } from '../lib/types'

  let adding = $state<Day | null>(null)

  const startDay = $derived(app.household?.weekStartDay ?? 0)
  const thisWeek = $derived(weekStart(today(), startDay))
  const lastWeek = $derived(addDays(thisWeek, -7))

  onMount(() => {
    void loadMeals()
    void loadReview()
    void loadWeek(lastWeek)
    void loadWeek(thisWeek)
    void loadWeek(addDays(thisWeek, 7))
  })

  // Nights already planned: a skipped meal can't be moved onto them.
  const taken = $derived(
    new Set(
      [...(plan.weeks[thisWeek] ?? []), ...(plan.weeks[addDays(thisWeek, 7)] ?? [])].map((e) => e.date),
    ),
  )
  const done = $derived(review.entries.filter((e) => e.status !== 'planned').length)
  // Past seven nights with nothing planned: where "we cooked something else too" goes.
  const emptyPast = $derived(
    Array.from({ length: 7 }, (_, i) => addDays(today(), -(i + 1)))
      .filter((d) => ![...(plan.weeks[lastWeek] ?? []), ...(plan.weeks[thisWeek] ?? [])].some((e) => e.date === d))
      .reverse(),
  )

  // "All good except the risotto, too much faff": fill the cards from one line.
  let line = $state('')
  let filling = $state(false)
  let filled = $state('')
  async function fillFromLine(): Promise<void> {
    filling = true
    filled = ''
    try {
      const { items } = await api.parseReview(today(), line.trim())
      const waiting = new Set(review.entries.filter((e) => e.status === 'planned').map((e) => e.id))
      let n = 0
      for (const it of items) {
        if (!waiting.has(it.entryId)) continue
        await updateEntry(it.entryId, { status: it.status, ...(it.note ? { cookNote: it.note } : {}) })
        if (it.status === 'cooked' && (it.stars !== null || it.thumbs !== null)) {
          await reviewCook(it.entryId, persona.value, { thumbs: it.thumbs, stars: it.stars })
        }
        n++
      }
      filled = n ? `Filled in ${n} dinner${n === 1 ? '' : 's'}. Check them below and change anything that's off.` : "Couldn't match that to any dinner. Try naming the meals."
      if (n) line = ''
    } catch (e) {
      filled = e instanceof Error ? e.message : String(e)
    } finally {
      filling = false
    }
  }

  async function closeAdd(): Promise<void> {
    adding = null
    await loadReview()
  }
</script>

<div class="head">
  <a class="back muted" href="#/week"><Chevron dir="left" /> Week</a>
  <h1>Review</h1>
</div>
<PersonaPicker />

{#if review.error}
  <p class="error" role="alert">{review.error}</p>
{:else if !review.loaded}
  <p class="muted">Loading…</p>
{:else if review.entries.length === 0}
  <div class="card empty">
    <p class="big">🎉</p>
    <p>Nothing to review. Every dinner's accounted for.</p>
    <a class="btn btn-primary" href="#/week">Back to the week</a>
  </div>
{:else}
  {#if done < review.entries.length || filled}
    <form class="line" onsubmit={(e) => { e.preventDefault(); void fillFromLine() }}>
      <label for="review-line">Say it in one line</label>
      <input id="review-line" placeholder="all good except the risotto, too much faff" maxlength="1000" bind:value={line} />
      <button class="btn btn-primary" type="submit" disabled={filling || !line.trim()}>{filling ? 'Reading…' : 'Fill in'}</button>
      {#if filled}<p class="muted small" role="status">{filled}</p>{/if}
    </form>
  {/if}
  <p class="progress muted" aria-live="polite">{done} of {review.entries.length} reviewed</p>
  <div class="list">
    {#each review.entries as entry (entry.id)}
      <ReviewCard {entry} {taken} />
    {/each}
  </div>
  {#if done === review.entries.length}
    <div class="card all-done" role="status">
      <p><strong>All reviewed.</strong> Ratings are updated from real cooks now.</p>
      <a class="btn btn-primary" href="#/week">Plan the week</a>
    </div>
  {/if}
{/if}

{#if review.loaded && emptyPast.length}
  <section class="extra" aria-labelledby="extra-title">
    <h2 id="extra-title">Cooked anything else?</h2>
    <p class="muted small">Add a dinner on a night that wasn't planned, then review it here.</p>
    <div class="picks">
      {#each emptyPast as d (d)}
        <button type="button" class={`pick day-${weekdayIndex(d)}`} onclick={() => (adding = d)}>{weekdayName(d)} {shortDate(d)}</button>
      {/each}
    </div>
  </section>
{/if}

{#if adding}
  <NightSheet start={weekStart(adding, startDay)} date={adding} entry={undefined} onclose={() => void closeAdd()} />
{/if}

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .back {
    text-decoration: none;
    font-weight: 600;
  }
  .line {
    display: grid;
    gap: 0.5rem;
    padding: 0.9rem 1rem;
    margin-top: 0.75rem;
    border-radius: var(--r-row);
    background: var(--plate);
    border: 1px solid var(--rule);
  }
  .line label {
    font-weight: 700;
  }
  .line input {
    min-height: 44px;
    padding: 0 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--bg);
  }
  .progress {
    margin: 0.75rem 0 0.5rem;
    font-weight: 600;
  }
  .list {
    display: grid;
    gap: 0.75rem;
  }
  .empty,
  .all-done {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 1.5rem 1rem;
    margin-top: 1rem;
    text-align: center;
  }
  .empty p,
  .all-done p {
    margin: 0;
  }
  .big {
    font-size: 2.5rem;
  }
  .extra {
    margin-top: 1.5rem;
    display: grid;
    gap: 0.4rem;
  }
  .extra h2 {
    font-size: 1.15rem;
  }
  .small {
    margin: 0;
    font-size: 0.85rem;
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .pick {
    min-height: 38px;
    padding: 0 0.8rem 0 0.65rem;
    border-radius: var(--r-row);
    border: 1.5px dashed var(--rule-strong);
    border-left: 5px solid var(--day);
    background: transparent;
    color: var(--plum);
    font-weight: 650;
    font-size: var(--s-1);
    cursor: pointer;
  }
</style>
