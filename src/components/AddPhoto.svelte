<script lang="ts">
  import { addPhoto } from '../lib/photos.svelte'

  let { dishId, entryId = null, label = 'Add photo' }: { dishId: string; entryId?: string | null; label?: string } = $props()

  let busy = $state(false)
  let error = $state('')
  const inputId = `photo-${Math.random().toString(36).slice(2, 8)}`

  async function picked(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    busy = true
    error = ''
    try {
      await addPhoto(dishId, entryId, file)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }
</script>

<span class="add">
  <label class="btn" for={inputId} aria-disabled={busy}>{busy ? 'Uploading…' : `📷 ${label}`}</label>
  <input id={inputId} class="visually-hidden" type="file" accept="image/*" disabled={busy} onchange={(e) => void picked(e)} />
  {#if error}<span class="error" role="alert">{error}</span>{/if}
</span>

<style>
  .add {
    display: inline-grid;
    gap: 0.3rem;
  }
  label[aria-disabled='true'] {
    opacity: 0.6;
    pointer-events: none;
  }
</style>
