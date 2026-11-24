<script lang="ts">
  import { onMount } from 'svelte'
  import NightSheet from '../components/NightSheet.svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import ReviewCard from '../components/ReviewCard.svelte'
  import { addDays, shortDate, today, weekStart, weekdayName } from '../lib/dates'
  import { loadMeals } from '../lib/meals.svelte'
  import { loadWeek, plan } from '../lib/plan.svelte'
  import { loadReview, review } from '../lib/review.svelte'
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

  async function closeAdd(): Promise<void> {
    adding = null
    await loadReview()
  }
</script>

<div class="head">
  <a class="back muted" href="#/week">‹ Week</a>
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
        <button type="button" class="pick" onclick={() => (adding = d)}>{weekdayName(d)} {shortDate(d)}</button>
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
  h1 {
    font-size: 1.6rem;
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
    min-height: 36px;
    padding: 0 0.8rem;
    border-radius: 999px;
    border: 1px dashed var(--border-strong);
    background: transparent;
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }
</style>
