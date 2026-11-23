<script lang="ts">
  type Value = { thumbs: -1 | 1 | null; stars: number | null }

  let {
    value,
    label,
    onchange,
    size = 'lg',
  }: { value: Value; label: string; onchange: (next: Value) => void; size?: 'lg' | 'md' | 'sm' | 'xs' } = $props()

  function setThumbs(t: -1 | 1): void {
    onchange({ thumbs: value.thumbs === t ? null : t, stars: value.stars })
  }
  function setStars(s: number): void {
    const stars = value.stars === s ? null : s
    // 3+ stars implies "make again" when thumbs isn't chosen yet; never overrides a thumbs down.
    const thumbs = value.thumbs === null && stars !== null && stars >= 3 ? 1 : value.thumbs
    onchange({ thumbs, stars })
  }
</script>

<div class={`rating ${size}`} role="group" aria-label={label}>
  <div class="thumbs">
    <button type="button" class="thumb up" aria-pressed={value.thumbs === 1} aria-label={`${label}: make again`} onclick={() => setThumbs(1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9h3zm2 9V10l4.5-7c1.2 0 2.2 1 2 2.2L15 9h4.6c1.2 0 2.1 1.1 1.9 2.3l-1.3 7c-.2 1-1 1.7-2 1.7H9z" /></svg>
    </button>
    <button type="button" class="thumb down" aria-pressed={value.thumbs === -1} aria-label={`${label}: don't make again`} onclick={() => setThumbs(-1)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4h3v9h-3zm-2-9v10l-4.5 7c-1.2 0-2.2-1-2-2.2L9 15H4.4c-1.2 0-2.1-1.1-1.9-2.3l1.3-7c.2-1 1-1.7 2-1.7H15z" /></svg>
    </button>
  </div>
  <div class="stars">
    {#each [1, 2, 3, 4, 5] as s (s)}
      <button
        type="button"
        class="star"
        class:on={(value.stars ?? 0) >= s}
        aria-pressed={value.stars === s}
        aria-label={`${label}: ${s} star${s === 1 ? '' : 's'}`}
        onclick={() => setStars(s)}>★</button>
    {/each}
  </div>
</div>

<style>
  .rating {
    --thumb: 44px;
    --star-w: 36px;
    --star-h: 44px;
    --star-font: 1.6rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .md {
    --thumb: 40px;
    --star-w: 30px;
    --star-h: 40px;
    --star-font: 1.4rem;
    gap: 0.4rem;
  }
  .sm {
    --thumb: 34px;
    --star-w: 26px;
    --star-h: 34px;
    --star-font: 1.25rem;
    gap: 0.3rem;
  }
  .xs {
    --thumb: 30px;
    --star-w: 24px;
    --star-h: 30px;
    --star-font: 1.15rem;
    gap: 0.25rem;
  }
  .thumbs,
  .stars {
    display: flex;
    gap: 0.2rem;
  }
  button {
    border: 1px solid var(--border-strong);
    background: var(--surface);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
  }
  .thumb {
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 999px;
    color: var(--text-muted);
  }
  .thumb svg {
    width: 52%;
    height: 52%;
    fill: currentColor;
  }
  .thumb.up[aria-pressed='true'] {
    background: var(--herb-soft);
    border-color: var(--herb);
    color: var(--herb);
  }
  .thumb.down[aria-pressed='true'] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .star {
    width: var(--star-w);
    height: var(--star-h);
    border: none;
    background: none;
    font-size: var(--star-font);
    line-height: 1;
    color: var(--border-strong);
  }
  .star.on {
    color: #e2a33b;
  }
</style>
