<script lang="ts">
  let { dir = 'right' }: { dir?: 'left' | 'right' } = $props()
</script>

<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
  <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
</svg>

<style>
  .chevron {
    width: 1.15em;
    height: 1.15em;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -0.2em;
  }
</style>
