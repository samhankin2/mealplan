<script lang="ts">
  import { onMount } from 'svelte'
  import { app, route, start } from './lib/state.svelte'
  import Login from './views/Login.svelte'
  import Week from './views/Week.svelte'
  import Settings from './views/Settings.svelte'
  import Meals from './views/Meals.svelte'
  import MealDetail from './views/MealDetail.svelte'
  import Rate from './views/Rate.svelte'
  import Review from './views/Review.svelte'
  import Freezer from './views/Freezer.svelte'

  const current = $derived(route())

  onMount(() => {
    void start()
  })
</script>

{#if app.status === 'loading'}
  <p class="boot muted" aria-live="polite">Loading…</p>
{:else if app.status === 'signed-out'}
  <Login />
{:else}
  <!-- Rating is a full-screen game: no app bar, it has its own back arrow. -->
  {#if current.name !== 'rate'}
  <header class="bar">
    <a class="brand" href="#/week">mealplan</a>
    <nav aria-label="Main">
      <a href="#/week" aria-current={['week', 'review', 'freezer'].includes(current.name) ? 'page' : undefined}>Week</a>
      <a href="#/meals" aria-current={['meals', 'meal', 'rate'].includes(current.name) ? 'page' : undefined}>Meals</a>
      <a href="#/settings" aria-current={current.name === 'settings' ? 'page' : undefined}>Settings</a>
    </nav>
  </header>
  {/if}
  <main class:focus={current.name === 'rate'}>
    {#if current.name === 'week'}
      <Week start={current.start} />
    {:else if current.name === 'meals'}
      <Meals />
    {:else if current.name === 'meal'}
      <MealDetail id={current.id} />
    {:else if current.name === 'rate'}
      <Rate />
    {:else if current.name === 'review'}
      <Review />
    {:else if current.name === 'freezer'}
      <Freezer />
    {:else}
      <Settings />
    {/if}
  </main>
{/if}

<style>
  .boot {
    text-align: center;
    padding: 4rem 1rem;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--accent);
    text-decoration: none;
  }
  nav {
    display: flex;
    gap: 0.25rem;
  }
  nav a {
    padding: 0.45rem 0.8rem;
    border-radius: 999px;
    color: var(--text-muted);
    text-decoration: none;
    font-weight: 600;
  }
  nav a[aria-current='page'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom));
  }
  main.focus {
    padding: calc(0.5rem + env(safe-area-inset-top)) 0.75rem calc(0.5rem + env(safe-area-inset-bottom));
  }
</style>
