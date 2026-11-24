<script lang="ts">
  import Chevron from '../components/Chevron.svelte'
  import { onMount } from 'svelte'
  import { shortDate } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { searchMeals } from '../lib/plan.svelte'
  import { addToFreezer, freezer, freezerLabel, loadFreezer, setPortions } from '../lib/review.svelte'

  let query = $state('')
  let portions = $state(2)
  let adding = $state(false)
  let error = $state('')

  onMount(() => {
    void loadMeals()
    void loadFreezer()
  })

  const total = $derived(freezer.items.reduce((n, f) => n + f.portions, 0))
  const matches = $derived(query.trim() ? searchMeals(meals.list, query, 5) : [])

  async function run(task: () => Promise<void>): Promise<void> {
    error = ''
    try {
      await task()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  const add = (dishId: string) =>
    run(async () => {
      await addToFreezer(dishId, portions)
      query = ''
      portions = 2
      adding = false
    })
</script>

<div class="head">
  <a class="back muted" href="#/week"><Chevron dir="left" /> Week</a>
  <h1>Freezer</h1>
</div>
<p class="muted">
  {total ? `${total} portion${total === 1 ? '' : 's'}, oldest first. Portions come off when you review a freezer night as eaten.` : 'Empty. "Froze some" in a review fills it.'}
</p>

{#if freezer.error || error}<p class="error" role="alert">{error || freezer.error}</p>{/if}

<ul class="items">
  {#each freezer.items as item (item.id)}
    <li class="card item">
      <span class="what">
        <span class="name">{freezerLabel(item, meals.list)}</span>
        {#if item.frozenOn}<span class="muted small">Frozen {shortDate(item.frozenOn)}</span>{/if}
      </span>
      <span class="count">
        <button type="button" class="step" aria-label={`One fewer ${freezerLabel(item, meals.list)}`} onclick={() => void run(() => setPortions(item.id, item.portions - 1))}>−</button>
        <strong>{item.portions}</strong>
        <button type="button" class="step" aria-label={`One more ${freezerLabel(item, meals.list)}`} onclick={() => void run(() => setPortions(item.id, item.portions + 1))}>+</button>
      </span>
    </li>
  {/each}
</ul>

{#if adding}
  <section class="card add" aria-labelledby="add-title">
    <h2 id="add-title">Add to the freezer</h2>
    <div class="frozen">
      <span>Portions</span>
      <button type="button" class="step" aria-label="One fewer portion" disabled={portions <= 1} onclick={() => (portions -= 1)}>−</button>
      <strong>{portions}</strong>
      <button type="button" class="step" aria-label="One more portion" disabled={portions >= 20} onclick={() => (portions += 1)}>+</button>
    </div>
    <label class="visually-hidden" for="freezer-search">Which meal?</label>
    <input id="freezer-search" class="search" type="search" placeholder="Which meal?" bind:value={query} />
    <div class="picks">
      {#each matches as m (m.id)}
        <button type="button" class="pick" onclick={() => void add(m.id)}>+ {m.name}</button>
      {/each}
    </div>
  </section>
{:else}
  <button class="btn wide" type="button" onclick={() => (adding = true)}>Add something by hand</button>
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
  .items {
    list-style: none;
    margin: 1rem 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem 0.6rem 1rem;
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
  }
  .count,
  .frozen {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .count strong,
  .frozen strong {
    min-width: 1.5rem;
    text-align: center;
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
  .add {
    display: grid;
    gap: 0.65rem;
    padding: 1rem;
  }
  .add h2 {
    font-size: 1.15rem;
  }
  .search {
    min-height: 44px;
    padding: 0 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--bg);
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .pick {
    min-height: 36px;
    padding: 0 0.8rem;
    border-radius: var(--r-row);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .wide {
    width: 100%;
  }
</style>
