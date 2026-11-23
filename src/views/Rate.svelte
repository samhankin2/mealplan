<script lang="ts">
  import { onMount } from 'svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import RatingControl from '../components/RatingControl.svelte'
  import { axes, loadMeals, meals, milestone, nextUnrated, persona, rate, ratedCount, ratingFor } from '../lib/meals.svelte'

  let skipped = $state(new Set<string>())
  let streak = $state(0)
  let pop = $state(0) // bumps to replay the +1 animation
  let celebrate = $state<string | null>(null)
  let error = $state('')
  let advancing = $state(false)

  // Stay on the current meal while it's being rated; pick the next one only on advance.
  let currentId = $state<string | null>(null)

  onMount(() => void loadMeals())

  const total = $derived(meals.list.length)
  const done = $derived(ratedCount(meals.list, persona.value))
  const pct = $derived(total ? Math.round((done / total) * 100) : 0)
  const current = $derived(meals.list.find((m) => m.id === currentId))
  const value = $derived(current ? ratingFor(current, null, persona.value) ?? { thumbs: null, stars: null } : { thumbs: null, stars: null })

  // Pick a meal when there isn't one (first load, persona switch, after advancing).
  $effect(() => {
    if (meals.loaded && !current) currentId = nextUnrated(meals.list, persona.value, skipped)?.id ?? null
  })
  // Switching persona starts their own queue.
  let lastPersona = persona.value
  $effect(() => {
    if (persona.value !== lastPersona) {
      lastPersona = persona.value
      skipped = new Set()
      streak = 0
      currentId = nextUnrated(meals.list, persona.value, skipped)?.id ?? null
    }
  })

  function advance(): void {
    advancing = false
    currentId = nextUnrated(meals.list, persona.value, skipped)?.id ?? null
  }

  async function onRate(next: { thumbs: -1 | 1 | null; stars: number | null }): Promise<void> {
    if (!current) return
    // Scored once, when the meal first has both thumbs and stars (taps arrive one at a time).
    const before = ratingFor(current, null, persona.value)
    const wasRated = Boolean(before && before.thumbs !== null && before.stars !== null)
    error = ''
    try {
      await rate(current.id, null, persona.value, next)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      return
    }
    // Thumbs + stars = done with this one: score it and move on.
    if (next.thumbs !== null && next.stars !== null && !advancing) {
      advancing = true
      if (!wasRated) {
        streak++
        pop++
        celebrate = milestone(ratedCount(meals.list, persona.value), total)
      }
      window.setTimeout(advance, celebrate ? 1400 : 650)
    }
  }

  function skip(): void {
    if (!current) return
    skipped = new Set([...skipped, current.id])
    streak = 0
    advance()
  }
</script>

<div class="top">
  <a class="back" href="#/meals">‹ Meals</a>
  <PersonaPicker />
</div>

<div class="progress-row">
  <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={done} aria-label="Meals rated">
    <span style={`width: ${pct}%`}></span>
  </div>
  <strong>{done}/{total}</strong>
  {#if streak >= 2}<span class="streak" aria-label={`${streak} in a row`}>🔥 {streak}</span>{/if}
</div>

{#if !meals.loaded}
  <p class="muted">Loading…</p>
{:else if !current}
  <div class="card finished">
    <p class="big">🎉</p>
    <h1>{done === total ? 'All rated!' : 'Nothing left in this round'}</h1>
    <p class="muted">
      {done === total ? `${total} meals rated. That's the lot.` : `You skipped ${skipped.size}. Come back to them any time.`}
    </p>
    {#if skipped.size}<button class="btn" type="button" onclick={() => { skipped = new Set(); advance() }}>Go through the skipped ones</button>{/if}
    <a class="btn btn-primary" href="#/meals">Back to meals</a>
  </div>
{:else}
  {#key current.id}
    <article class="card meal" aria-labelledby="meal-name">
      <p class="made muted">{current.cooked ? `Made ${current.cooked} time${current.cooked === 1 ? '' : 's'}` : 'From the recipe list'}</p>
      <h1 id="meal-name">{current.name}</h1>
      {#if current.options.length}
        <p class="opts muted">{axes(current).map((a) => a.options.map((o) => o.name).join(' · ')).join('  |  ')}</p>
      {/if}
      <div class="rate">
        <RatingControl label={current.name} value={value} onchange={(v) => void onRate(v)} />
      </div>
      <p class="hint muted">Thumbs = make again? Stars = how good.</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="btn" type="button" onclick={skip}>Skip</button>
        <a class="btn" href={`#/meals/${encodeURIComponent(current.id)}`}>Options, tags & notes</a>
      </div>
      {#key pop}{#if pop}<span class="plus" aria-hidden="true">+1</span>{/if}{/key}
    </article>
  {/key}
{/if}

{#if celebrate}
  <div class="celebrate" role="status" aria-live="polite">
    <div class="burst" aria-hidden="true">
      {#each Array.from({ length: 14 }) as _, i (i)}<span style={`--i:${i}`}></span>{/each}
    </div>
    <p>{celebrate}</p>
    <button class="btn btn-primary" type="button" onclick={() => { celebrate = null }}>Nice</button>
  </div>
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .back {
    color: var(--text-muted);
    text-decoration: none;
    font-weight: 600;
  }
  .progress-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1rem;
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
    transition: width 0.4s ease;
  }
  .streak {
    font-weight: 700;
    color: var(--accent);
  }
  .meal {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 2rem 1rem 1.25rem;
    text-align: center;
    animation: enter 0.25s ease-out;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
  }
  .made {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  h1 {
    font-size: 2rem;
  }
  .opts {
    margin: 0;
    font-size: 0.9rem;
  }
  .rate {
    margin: 0.75rem 0 0.25rem;
  }
  .rate :global(.rating) {
    justify-content: center;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .plus {
    position: absolute;
    top: 0.75rem;
    right: 1rem;
    font-weight: 800;
    font-size: 1.4rem;
    color: var(--herb);
    animation: rise 0.8s ease-out forwards;
  }
  @keyframes rise {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-28px);
    }
  }
  .finished {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    text-align: center;
  }
  .finished p {
    margin: 0;
  }
  .big {
    font-size: 3rem;
  }
  .celebrate {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    padding: 1rem;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    text-align: center;
    animation: enter 0.2s ease-out;
  }
  .celebrate p {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.8rem;
    font-weight: 700;
  }
  .burst {
    position: relative;
    width: 1px;
    height: 1px;
  }
  .burst span {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: hsl(calc(var(--i) * 26) 75% 55%);
    animation: fly 0.9s ease-out forwards;
    transform: rotate(calc(var(--i) * 25.7deg)) translateY(0);
  }
  @keyframes fly {
    to {
      transform: rotate(calc(var(--i) * 25.7deg)) translateY(-90px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .meal,
    .plus,
    .burst span,
    .celebrate {
      animation: none;
    }
  }
</style>
