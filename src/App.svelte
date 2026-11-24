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
  import Shop from './views/Shop.svelte'

  const current = $derived(route())

  // Line icons drawn on a 24 grid: a week grid, a bowl, a basket, a dial.
  const TABS = [
    { href: '#/week', label: 'Week', match: ['week', 'review', 'freezer'], icon: 'M4 5h16v15H4zM4 9h16M9 5v15M14 5v15M8 3v3M16 3v3' },
    { href: '#/meals', label: 'Meals', match: ['meals', 'meal'], icon: 'M3 11h18a9 9 0 0 1-18 0zM8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4' },
    { href: '#/shop', label: 'Shop', match: ['shop'], icon: 'M4 9h16l-1.6 10.5a1 1 0 0 1-1 .5H6.6a1 1 0 0 1-1-.5zM8 9l3-5M16 9l-3-5' },
    { href: '#/settings', label: 'Settings', match: ['settings'], icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1' },
  ]

  onMount(() => {
    void start()
  })
</script>

{#if app.status === 'loading'}
  <p class="boot muted" aria-live="polite">Loading…</p>
{:else if app.status === 'signed-out'}
  <Login />
{:else}
  <!-- Rating is a full-screen game: no tab bar, it has its own back arrow. -->
  {#if current.name !== 'rate'}
    <nav class="tabs" aria-label="Main">
      {#each TABS as tab (tab.href)}
        <a href={tab.href} aria-current={tab.match.includes(current.name) ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.icon} /></svg>
          <span>{tab.label}</span>
        </a>
      {/each}
    </nav>
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
    {:else if current.name === 'shop'}
      <Shop week={current.week} />
    {:else}
      <Settings />
    {/if}
  </main>
{/if}

<style>
  .boot {
    padding: 4rem 1rem;
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: calc(1.25rem + env(safe-area-inset-top)) 1rem calc(5.5rem + env(safe-area-inset-bottom));
  }
  main.focus {
    padding: calc(0.5rem + env(safe-area-inset-top)) 0.75rem calc(0.5rem + env(safe-area-inset-bottom));
  }
  /* Bottom tabs: where thumbs are when the phone's in one hand at the shop. */
  .tabs {
    position: fixed;
    z-index: 10;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    max-width: 640px;
    margin: 0 auto;
    padding: 0.35rem 0.5rem calc(0.35rem + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--enamel) 94%, transparent);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--rule);
  }
  .tabs a {
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    padding: 0.35rem 0;
    border-radius: var(--r-row);
    color: var(--pepper);
    text-decoration: none;
    font-size: var(--s-1);
    font-weight: 650;
  }
  .tabs svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tabs a[aria-current='page'] {
    color: var(--plum);
  }
  .tabs a[aria-current='page'] svg {
    stroke-width: 2.2;
  }
</style>
