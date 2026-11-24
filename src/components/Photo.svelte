<script lang="ts">
  import { photoUrl } from '../lib/photos.svelte'

  let { id, alt, size = 'md' }: { id: string; alt: string; size?: 'sm' | 'md' | 'lg' } = $props()

  let src = $state<string | null>(null)
  let failed = $state(false)

  $effect(() => {
    src = null
    failed = false
    photoUrl(id).then(
      (u) => (src = u),
      () => (failed = true),
    )
  })
</script>

<span class={`photo ${size}`}>
  {#if src}
    <img {src} {alt} loading="lazy" />
  {:else}
    <span class="placeholder" aria-label={failed ? `${alt} (could not load)` : `${alt} (loading)`}></span>
  {/if}
</span>

<style>
  .photo {
    display: block;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
  }
  .sm {
    width: 56px;
    height: 56px;
  }
  .md {
    width: 96px;
    height: 96px;
  }
  .lg {
    width: 100%;
    aspect-ratio: 16 / 9;
  }
  img,
  .placeholder {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
