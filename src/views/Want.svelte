<script lang="ts">
  /** The want-to-make list on its own tab; Ideas still reads it to lift those meals. */
  import WantPad from '../components/WantPad.svelte'
  import { loadMeals } from '../lib/meals.svelte'
  import { loadWants } from '../lib/wants.svelte'

  $effect(() => {
    void loadMeals()
    void loadWants()
  })
</script>

<WantPad />
