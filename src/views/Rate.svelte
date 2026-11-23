<script lang="ts">
  import { onMount } from 'svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import RateRows from '../components/RateRows.svelte'
  import { isRated, loadMeals, meals, milestone, nextUnrated, persona, ratedCount, ratedParts } from '../lib/meals.svelte'

  let skipped = $state(new Set<string>())
  let streak = $state(0)
  let pop = $state(0) // bumps to replay the +1 animation
  let celebrate = $state<string | null>(null)
  let error = $state('')
  let advancing = $state(false)
  let currentId = $state<string | null>(null)

  onMount(() => void loadMeals())

  const total = $derived(meals.list.length)
  const done = $derived(ratedCount(meals.list, persona.value))
  const pct = $derived(total ? Math.round((done / total) * 100) : 0)
  const current = $derived(meals.list.find((m) => m.id === currentId))
  const parts = $derived(current ? ratedParts(current, persona.value) : [0, 0])

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
    error = ''
    currentId = nextUnrated(meals.list, persona.value, skipped)?.id ?? null
  }

  // After each tap: a meal with every variation rated scores and moves on.
  function onRated(): void {
    if (!current || advancing || !isRated(current, persona.value)) return
    advancing = true
    streak++
    pop++
    celebrate = milestone(ratedCount(meals.list, persona.value), total)
    window.setTimeout(advance, celebrate ? 1400 : 600)
  }

  function next(): void {
    if (!current) return
    if (!isRated(current, persona.value)) {
      skipped = new Set([...skipped, current.id])
      streak = 0
    }
    advance()
  }
</script>

<div class="page">
  <div class="top">
    <a class="back" href="#/meals" aria-label="Back to meals">‹</a>
    <PersonaPicker />
  </div>

  <div class="progress-row">
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={done} aria-label="Meals rated">
      <span style={`width: ${pct}%`}></span>
    </div>
    <strong>{done}/{total}</strong>
    {#if streak >= 2}<span class="streak" aria-label={`${streak} in a row`}>🔥{streak}</span>{/if}
  </div>

  {#if !meals.loaded}
    <p class="muted">Loading…</p>
  {:else if !current}
    <div class="card finished">
      <p class="big">🎉</p>
      <h1>{done === total ? 'All rated!' : 'Nothing left in this round'}</h1>
      <p class="muted">{done === total ? `${total} meals, every variation.` : `You skipped ${skipped.size}. Come back to them any time.`}</p>
      {#if skipped.size}<button class="btn" type="button" onclick={() => { skipped = new Set(); advance() }}>Go through the skipped ones</button>{/if}
      <a class="btn btn-primary" href="#/meals">Back to meals</a>
    </div>
  {:else}
    {#key current.id}
      <article class="card meal" aria-labelledby="meal-name">
        <header>
          <p class="made muted">
            {current.cooked ? `Made ${current.cooked}×` : 'Recipe list'}{parts[1] > 1 ? ` · ${parts[0]}/${parts[1]} rated` : ''}
          </p>
          <h1 id="meal-name">{current.name}</h1>
        </header>
        <RateRows meal={current} ratedAs={persona.value} onrated={onRated} onerror={(m) => (error = m)} />
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <footer>
          <a class="detail muted" href={`#/meals/${encodeURIComponent(current.id)}`}>Tags & notes</a>
          <button class="btn btn-primary" type="button" onclick={next}>{isRated(current, persona.value) ? 'Next ›' : 'Skip ›'}</button>
        </footer>
        {#key pop}{#if pop}<span class="plus" aria-hidden="true">+1</span>{/if}{/key}
      </article>
    {/key}
  {/if}
</div>

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
  /* One screen, no scrolling: the page is exactly the viewport (no app bar here). */
  .page {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: calc(100dvh - 1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }
  .top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .back {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 1.5rem;
    font-weight: 600;
    flex: none;
  }
  .top :global(.label) {
    display: none;
  }
  .progress-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
  }
  .bar {
    height: 10px;
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
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 0.9rem 0.75rem 0.75rem;
    text-align: center;
    animation: enter 0.25s ease-out;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
  }
  header {
    display: grid;
    gap: 0.15rem;
  }
  .made {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  h1 {
    font-size: 1.7rem;
  }
  footer {
    margin-top: auto;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .detail {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .plus {
    position: absolute;
    top: 0.6rem;
    right: 0.9rem;
    font-weight: 800;
    font-size: 1.4rem;
    color: var(--herb);
    animation: rise 0.8s ease-out forwards;
  }
  @keyframes rise {
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
    transform: rotate(calc(var(--i) * 25.7deg));
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
