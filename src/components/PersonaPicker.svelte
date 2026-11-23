<script lang="ts">
  import { app } from '../lib/state.svelte'
  import { persona, setPersona } from '../lib/meals.svelte'

  const choices = $derived([
    { value: 'both', label: 'Both' },
    ...(app.household?.members ?? []).map((m) => ({ value: m.id, label: m.me ? `${m.name} (me)` : m.name })),
  ])

  // A remembered member who has since left the household falls back to Both.
  $effect(() => {
    if (app.household && !choices.some((c) => c.value === persona.value)) setPersona('both')
  })
</script>

<div class="persona" role="radiogroup" aria-label="Rating as">
  <span class="muted label">Rating as</span>
  {#each choices as c (c.value)}
    <button type="button" role="radio" aria-checked={persona.value === c.value} onclick={() => setPersona(c.value)}>{c.label}</button>
  {/each}
</div>

<style>
  .persona {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .label {
    font-size: 0.85rem;
    margin-right: 0.15rem;
  }
  button {
    min-height: 36px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }
  button[aria-checked='true'] {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
  }
</style>
