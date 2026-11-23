<script lang="ts">
  import RatingControl from './RatingControl.svelte'
  import { hiddenRateables, rate, rateables, ratingFor, setHidden } from '../lib/meals.svelte'
  import type { Meal, RatedAs } from '../lib/types'

  let { meal, ratedAs, onrated, onerror, onremove }: {
    meal: Meal
    ratedAs: RatedAs
    onrated?: () => void
    onerror?: (message: string) => void
    /** Remove the whole meal (never had it). Left out: not offered. */
    onremove?: (meal: Meal) => void
  } = $props()

  const rows = $derived(rateables(meal))
  const hidden = $derived(hiddenRateables(meal))
  // Always one screen: rows shrink as the list grows (risotto has 11).
  const size = $derived(rows.length === 1 ? 'lg' : rows.length <= 5 ? 'md' : rows.length <= 8 ? 'sm' : 'xs')
  const blank = { thumbs: null, stars: null } as const
  const single = $derived(rows.length === 1 && rows[0].key === null)

  let menuFor = $state<string | null | undefined>(undefined) // the row whose options are open
  let showHidden = $state(false)

  async function change(key: string | null, label: string, v: { thumbs: -1 | 1 | null; stars: number | null; want?: boolean }): Promise<void> {
    menuFor = undefined
    try {
      await rate(meal.id, key, ratedAs, v)
      onrated?.()
    } catch (e) {
      onerror?.(e instanceof Error ? e.message : `Could not save ${label}`)
    }
  }

  function toggleWant(key: string | null, label: string): void {
    const wanted = Boolean(ratingFor(meal, key, ratedAs)?.want)
    void change(key, label, { thumbs: null, stars: null, want: !wanted })
  }

  // Never had it: take the variation off the list. The last one left takes the meal with it.
  async function neverHad(key: string | null, label: string): Promise<void> {
    menuFor = undefined
    if (key === null || rows.length === 1) {
      onremove?.(meal)
      return
    }
    try {
      await setHidden(meal.id, key, true)
      onrated?.()
    } catch (e) {
      onerror?.(e instanceof Error ? e.message : `Could not remove ${label}`)
    }
  }

  async function putBack(key: string, label: string): Promise<void> {
    try {
      await setHidden(meal.id, key, false)
      if (hidden.length === 0) showHidden = false
    } catch (e) {
      onerror?.(e instanceof Error ? e.message : `Could not put back ${label}`)
    }
  }
</script>

{#snippet wantIcon()}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>{/snippet}

{#if single}
  {@const v = ratingFor(meal, null, ratedAs)}
  <div class="single">
    {#if v?.want}
      <button type="button" class="want-pill lg" aria-pressed="true" onclick={() => toggleWant(null, meal.name)}>{@render wantIcon()} Want to make <span class="muted">· undo</span></button>
    {:else}
      <RatingControl label={meal.name} value={v ?? blank} onchange={(next) => void change(null, meal.name, next)} />
    {/if}
    <div class="single-actions">
      {#if !v?.want}
        <button type="button" class="link" onclick={() => toggleWant(null, meal.name)}>{@render wantIcon()} Haven't had it, want to make</button>
      {/if}
      {#if onremove}
        <button type="button" class="link danger" onclick={() => void neverHad(null, meal.name)}>Never had it · remove</button>
      {/if}
    </div>
  </div>
{:else}
  <ul class={`rows ${size}`}>
    {#each rows as row (row.key)}
      {@const r = ratingFor(meal, row.key, ratedAs)}
      {@const v = r ?? blank}
      {@const [first, ...rest] = row.label.split(' · ')}
      <li class:done={(v.thumbs !== null && v.stars !== null) || r?.want} class:wanted={r?.want}>
        <span class="label" title={row.label}>
          <span class="first">{first}</span>{#if rest.length}<span class="rest"><span class="visually-hidden"> · </span>{rest.join(' · ')}</span>{/if}
        </span>
        {#if menuFor === row.key}
          <span class="menu">
            <button type="button" class="opt" onclick={() => toggleWant(row.key, row.label)}>{@render wantIcon()} {r?.want ? 'Not wanted' : 'Want to make'}</button>
            {#if rows.length > 1 || onremove}
              <button type="button" class="opt danger" onclick={() => void neverHad(row.key, row.label)}>{rows.length > 1 ? 'Never had' : 'Remove meal'}</button>
            {/if}
          </span>
        {:else if r?.want}
          <button type="button" class="want-pill" aria-pressed="true" aria-label={`${meal.name}, ${row.label}: want to make. Tap to undo`} onclick={() => toggleWant(row.key, row.label)}>{@render wantIcon()} Want to make</button>
        {:else}
          <RatingControl size={size === 'lg' ? 'md' : size} label={`${meal.name}, ${row.label}`} value={v} onchange={(next) => void change(row.key, row.label, next)} />
        {/if}
        <button
          type="button"
          class="more"
          aria-expanded={menuFor === row.key}
          aria-label={menuFor === row.key ? 'Close' : `More for ${row.label}: want to make, never had`}
          onclick={() => (menuFor = menuFor === row.key ? undefined : row.key)}>{menuFor === row.key ? '×' : '⋯'}</button>
      </li>
    {/each}
  </ul>
{/if}

{#if hidden.length}
  <div class="hidden-list">
    <button type="button" class="link" aria-expanded={showHidden} onclick={() => (showHidden = !showHidden)}>
      {hidden.length} never had · {showHidden ? 'hide' : 'put back'}
    </button>
    {#if showHidden}
      <ul>
        {#each hidden as h (h.key)}
          <li><button type="button" class="chip" onclick={() => void putBack(h.key!, h.label)} aria-label={`Put back ${h.label}`}>+ {h.label}</button></li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .single {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
  }
  .single-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem 1rem;
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
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.1rem 0.15rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    border: 1px solid transparent;
  }
  .rows li.done {
    background: var(--herb-soft);
  }
  .rows li.wanted {
    background: #f7e7c3;
  }
  .sm li {
    padding-left: 0.5rem;
  }
  .xs {
    gap: 0.2rem;
  }
  .xs li {
    padding: 0 0.05rem 0 0.5rem;
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
  /* Names wrap (two lines at most) rather than being cut off. */
  .first,
  .rest {
    overflow: hidden;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
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
  svg {
    width: 1em;
    height: 1em;
    fill: currentColor;
    vertical-align: -0.12em;
  }
  .more {
    width: 28px;
    height: 32px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .menu {
    display: flex;
    gap: 0.3rem;
  }
  .opt,
  .want-pill {
    min-height: 32px;
    padding: 0 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    font-size: 0.85rem;
    white-space: nowrap;
    cursor: pointer;
  }
  .want-pill {
    background: #f7e7c3;
    border-color: #c98a1e;
    color: #5b3d05;
  }
  .want-pill.lg {
    min-height: 48px;
    padding: 0 1.2rem;
    font-size: 1rem;
  }
  .opt.danger {
    color: var(--accent);
    border-color: var(--accent);
  }
  .link {
    border: none;
    background: none;
    padding: 0.25rem 0;
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link.danger {
    color: var(--accent);
  }
  .hidden-list {
    width: 100%;
    text-align: left;
  }
  .hidden-list ul {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .chip {
    min-height: 30px;
    padding: 0 0.7rem;
    border-radius: 999px;
    border: 1px dashed var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
