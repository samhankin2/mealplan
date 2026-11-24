<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props()

  let panel: HTMLDivElement | undefined = $state()
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`

  onMount(() => {
    const before = document.activeElement as HTMLElement | null
    // Focus the first field if there is one, else the panel itself.
    const first = panel?.querySelector<HTMLElement>('input, textarea, select') ?? panel
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onclose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      before?.focus?.()
    }
  })
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" bind:this={panel}>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button type="button" class="close" aria-label="Close" onclick={onclose}>×</button>
  </header>
  <div class="body">
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgb(30 20 10 / 40%);
  }
  .sheet {
    position: fixed;
    z-index: 31;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 88dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-radius: 18px 18px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: up 0.2s ease-out;
    max-width: 640px;
    margin: 0 auto;
  }
  @keyframes up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem 0.5rem;
  }
  h2 {
    font-size: 1.3rem;
  }
  .close {
    width: 40px;
    height: 40px;
    border: none;
    background: var(--surface-sunken);
    border-radius: 999px;
    font-size: 1.4rem;
    color: var(--text-muted);
    cursor: pointer;
  }
  .body {
    overflow-y: auto;
    padding: 0.25rem 1rem 1rem;
  }
</style>
