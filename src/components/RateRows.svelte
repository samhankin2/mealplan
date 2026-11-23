<script lang="ts">
  import RatingControl from './RatingControl.svelte'
  import { rate, rateables, ratingFor } from '../lib/meals.svelte'
  import type { Meal, RatedAs } from '../lib/types'

  let { meal, ratedAs, onrated, onerror }: {
    meal: Meal
    ratedAs: RatedAs
    onrated?: () => void
    onerror?: (message: string) => void
  } = $props()

  const rows = $derived(rateables(meal))
  // Always one screen: rows shrink as the list grows (risotto has 11).
  const size = $derived(rows.length === 1 ? 'lg' : rows.length <= 5 ? 'md' : rows.length <= 8 ? 'sm' : 'xs')
  const blank = { thumbs: null, stars: null } as const

  async function change(key: string | null, label: string, v: { thumbs: -1 | 1 | null; stars: number | null }): Promise<void> {
    try {
      await rate(meal.id, key, ratedAs, v)
      onrated?.()
    } catch (e) {
      onerror?.(e instanceof Error ? e.message : `Could not save ${label}`)
    }
  }
</script>

{#if rows.length === 1 && rows[0].key === null}
  <div class="single">
    <RatingControl label={meal.name} value={ratingFor(meal, null, ratedAs) ?? blank} onchange={(v) => void change(null, meal.name, v)} />
  </div>
{:else}
  <ul class={`rows ${size}`}>
    {#each rows as row (row.key)}
      {@const v = ratingFor(meal, row.key, ratedAs) ?? blank}
      {@const [first, ...rest] = row.label.split(' · ')}
      <li class:done={v.thumbs !== null && v.stars !== null}>
        <span class="label" title={row.label}>
          <span class="first">{first}</span>{#if rest.length}<span class="rest"><span class="visually-hidden"> · </span>{rest.join(' · ')}</span>{/if}
        </span>
        <RatingControl size={size === 'lg' ? 'md' : size} label={`${meal.name}, ${row.label}`} value={v} onchange={(next) => void change(row.key, row.label, next)} />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .single {
    display: flex;
    justify-content: center;
    padding: 0.5rem 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
    width: 100%;
  }
  .rows li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.25rem 0.15rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    border: 1px solid transparent;
  }
  .rows li.done {
    background: var(--herb-soft);
  }
  .sm li {
    padding-left: 0.5rem;
  }
  .xs {
    gap: 0.2rem;
  }
  .xs li {
    padding: 0 0.15rem 0 0.5rem;
  }
  .xs .label {
    font-size: 0.85rem;
  }
  .label {
    display: grid;
    text-align: left;
    line-height: 1.15;
    min-width: 0;
  }
  .first,
  .rest {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .first {
    font-weight: 600;
  }
  .rest {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .sm .label {
    font-size: 0.9rem;
  }
</style>
