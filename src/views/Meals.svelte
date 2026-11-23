<script lang="ts">
  import { onMount } from 'svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import { app } from '../lib/state.svelte'
  import { bestRating, isRated, loadMeals, meals, persona, ratedCount, ratedParts, sortedMeals } from '../lib/meals.svelte'

  let query = $state('')
  let filter = $state<'all' | 'unrated'>('all')

  onMount(() => void loadMeals(true))

  const total = $derived(meals.list.length)
  const done = $derived(ratedCount(meals.list, persona.value))
  const pct = $derived(total ? Math.round((done / total) * 100) : 0)
  const board = $derived(
    [
      { id: 'both', name: 'Both' },
      ...(app.household?.members ?? []).map((m) => ({ id: m.id, name: m.name })),
    ]
      .map((p) => ({ ...p, count: ratedCount(meals.list, p.id) }))
      .sort((a, b) => b.count - a.count),
  )
  const shown = $derived(
    sortedMeals(meals.list).filter((m) => {
      if (filter === 'unrated' && isRated(m, persona.value)) return false
      const q = query.trim().toLowerCase()
      return !q || m.name.toLowerCase().includes(q) || m.aliases.some((a) => a.includes(q)) || m.tags.some((t) => t.toLowerCase().includes(q))
    }),
  )
</script>

<h1>Meals</h1>

<section class="card game" aria-labelledby="game-title">
  <h2 id="game-title" class="visually-hidden">Rating progress</h2>
  <PersonaPicker />
  <div class="progress-row">
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={done} aria-label="Meals rated">
      <span style={`width: ${pct}%`}></span>
    </div>
    <strong>{done}/{total}</strong>
  </div>
  {#if board.length > 1}
    <ol class="board" aria-label="Leaderboard">
      {#each board as p, i (p.id)}
        <li class:lead={i === 0 && p.count > 0}>
          <span>{i === 0 && p.count > 0 ? '🏆 ' : ''}{p.name}</span>
          <strong>{p.count}</strong>
        </li>
      {/each}
    </ol>
  {/if}
  <a class="btn btn-primary start" href="#/rate">{done === 0 ? 'Start rating' : done === total ? 'All rated. Review again?' : 'Keep rating'}</a>
</section>

<div class="tools">
  <label class="visually-hidden" for="meal-search">Search meals</label>
  <input id="meal-search" type="search" placeholder="Search meals, tags…" bind:value={query} />
  <div class="filters" role="radiogroup" aria-label="Show">
    <button type="button" role="radio" aria-checked={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
    <button type="button" role="radio" aria-checked={filter === 'unrated'} onclick={() => (filter = 'unrated')}>Unrated</button>
  </div>
</div>

{#if meals.error}
  <p class="error" role="alert">{meals.error}</p>
{:else if !meals.loaded}
  <p class="muted">Loading meals…</p>
{:else if meals.list.length === 0}
  <p class="muted">No meals yet. They arrive with the history import.</p>
{:else}
  <ul class="list">
    {#each shown as meal (meal.id)}
      {@const r = bestRating(meal, persona.value)}
      {@const parts = ratedParts(meal, persona.value)}
      <li>
        <a class="card row" href={`#/meals/${encodeURIComponent(meal.id)}`}>
          <span class="name">{meal.name}</span>
          <span class="meta muted">{meal.cooked ? `made ${meal.cooked}×` : 'not in history'}{parts[1] > 1 ? ` · ${parts[0]}/${parts[1]} variations` : ''}</span>
          <span class="score" aria-label={r ? `rated ${r.thumbs === 1 ? 'thumbs up' : r.thumbs === -1 ? 'thumbs down' : ''} ${r.stars ? `${r.stars} stars` : ''}` : 'not rated'}>
            {#if r}
              {r.thumbs === 1 ? '👍' : r.thumbs === -1 ? '👎' : ''}{r.stars ? ` ${'★'.repeat(r.stars)}` : ''}
            {:else}
              <span class="dot" aria-hidden="true"></span>
            {/if}
          </span>
        </a>
      </li>
    {:else}
      <li class="muted">Nothing matches.</li>
    {/each}
  </ul>
{/if}

<style>
  h1 {
    font-size: 1.6rem;
    margin-bottom: 1rem;
  }
  .game {
    display: grid;
    gap: 0.85rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .progress-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }
  .bar {
    height: 12px;
    border-radius: 999px;
    background: var(--surface-sunken);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #e2a33b);
    border-radius: 999px;
    transition: width 0.4s ease;
  }
  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .board li {
    display: flex;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    background: var(--surface-sunken);
    font-size: 0.9rem;
  }
  .board li.lead {
    background: #f7e7c3;
    color: #5b3d05;
  }
  .start {
    justify-self: stretch;
  }
  .tools {
    display: grid;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
  }
  .tools input {
    min-height: 46px;
    padding: 0 0.85rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
  }
  .filters {
    display: flex;
    gap: 0.35rem;
  }
  .filters button {
    min-height: 36px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
  }
  .filters button[aria-checked='true'] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'name score' 'meta score';
    align-items: center;
    column-gap: 0.75rem;
    padding: 0.65rem 1rem;
    color: inherit;
    text-decoration: none;
    box-shadow: none;
  }
  .name {
    grid-area: name;
    font-weight: 600;
  }
  .meta {
    grid-area: meta;
    font-size: 0.85rem;
  }
  .score {
    grid-area: score;
    color: #c98a1e;
    white-space: nowrap;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
  }
</style>
