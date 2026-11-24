<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount } from 'svelte'

  /** `day`: 0–6 when the sheet is about one night; its colour runs along the top edge. */
  let { title, onclose, children, day = null }: { title: string; onclose: () => void; children: Snippet; day?: number | null } = $props()

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
<div class={`sheet ${day !== null ? `day-${day} has-day` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" bind:this={panel}>
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
    background: color-mix(in srgb, #2b2233 45%, transparent);
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
    background: var(--enamel);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: up 0.22s ease-out;
    max-width: 640px;
    margin: 0 auto;
  }
  .sheet.has-day {
    border-top: 6px solid var(--day);
  }
  @keyframes up {
    from {
      transform: translateY(32px);
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1rem 0.5rem;
  }
  h2 {
    font-size: var(--s2);
    font-stretch: 85%;
  }
  .close {
    width: 40px;
    height: 40px;
    flex: none;
    border: 1px solid var(--rule-strong);
    background: transparent;
    border-radius: var(--r-row);
    font-size: 1.4rem;
    line-height: 1;
    color: var(--plum);
    cursor: pointer;
  }
  .body {
    overflow-y: auto;
    padding: 0.25rem 1rem 1.25rem;
  }
</style>
