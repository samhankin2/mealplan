<script lang="ts">
  import { onMount } from 'svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import RateRows from '../components/RateRows.svelte'
  import { addNote, loadMeals, meals, persona, ratedParts, saveMeal, sortedMeals } from '../lib/meals.svelte'
  import { app } from '../lib/state.svelte'

  let { id }: { id: string } = $props()

  let error = $state('')
  let newTag = $state('')
  let note = $state('')
  let sending = $state(false)

  onMount(() => void loadMeals())

  const order = $derived(sortedMeals(meals.list))
  const index = $derived(order.findIndex((m) => m.id === id))
  const meal = $derived(order[index])
  const prev = $derived(index > 0 ? order[index - 1] : undefined)
  const next = $derived(index >= 0 && index < order.length - 1 ? order[index + 1] : undefined)
  const offered = $derived(meal ? meal.suggestedTags.filter((t) => !meal.tags.some((x) => x.toLowerCase() === t.toLowerCase())) : [])
  const nameOf = (userId: string | null): string => app.household?.members.find((m) => m.id === userId)?.name ?? 'Someone'

  async function run(task: () => Promise<void>): Promise<void> {
    error = ''
    try {
      await task()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  function setEffort(e: 1 | 2 | 3): void {
    void run(() => saveMeal(meal!.id, { effort: meal!.effort === e ? null : e }))
  }
  function acceptTag(tag: string): void {
    void run(() => saveMeal(meal!.id, { tags: [...meal!.tags, tag] }))
  }
  function removeTag(tag: string): void {
    void run(() => saveMeal(meal!.id, { tags: meal!.tags.filter((t) => t !== tag) }))
  }
  function dismissSuggestion(tag: string): void {
    void run(() => saveMeal(meal!.id, { suggestedTags: meal!.suggestedTags.filter((t) => t !== tag) }))
  }
  function addTag(event: SubmitEvent): void {
    event.preventDefault()
    const tag = newTag.trim()
    if (!tag) return
    newTag = ''
    if (!meal!.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) acceptTag(tag)
  }
  async function sendNote(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (!note.trim()) return
    sending = true
    await run(async () => {
      await addNote(meal!.id, note.trim())
      note = ''
    })
    sending = false
  }
</script>

{#if !meals.loaded}
  <p class="muted">Loading…</p>
{:else if !meal}
  <p class="muted">That meal isn't here any more. <a href="#/meals">Back to meals</a></p>
{:else}
  <nav class="pager" aria-label="Meals">
    <a class="btn btn-icon" href={prev ? `#/meals/${encodeURIComponent(prev.id)}` : undefined} aria-disabled={!prev} aria-label="Previous meal">‹</a>
    <a class="all muted" href="#/meals">{index + 1} of {order.length}</a>
    <a class="btn btn-icon" href={next ? `#/meals/${encodeURIComponent(next.id)}` : undefined} aria-disabled={!next} aria-label="Next meal">›</a>
  </nav>

  <header class="head">
    <h1>{meal.name}</h1>
    <p class="muted">
      {meal.cooked ? `Made ${meal.cooked} time${meal.cooked === 1 ? '' : 's'}` : 'From the recipe list'}{meal.aliases.length ? ` · also “${meal.aliases.slice(0, 3).join('”, “')}”` : ''}
    </p>
    {#if meal.tips}<p class="tips">Tip: {meal.tips}</p>{/if}
  </header>

  <section class="card block" aria-labelledby="rate-title">
    <div class="block-head">
      <h2 id="rate-title">Rating</h2>
      <PersonaPicker />
    </div>
    {#if ratedParts(meal, persona.value)[1] > 1}<p class="muted small">{ratedParts(meal, persona.value)[0]} of {ratedParts(meal, persona.value)[1]} variations rated</p>{/if}
    <RateRows {meal} ratedAs={persona.value} onerror={(m) => (error = m)} />
  </section>

  <section class="card block" aria-labelledby="effort-title">
    <h2 id="effort-title">Effort</h2>
    <div class="seg" role="radiogroup" aria-labelledby="effort-title">
      {#each [[1, 'Low'], [2, 'Medium'], [3, 'High']] as [e, label] (e)}
        <button type="button" role="radio" aria-checked={meal.effort === e} onclick={() => setEffort(e as 1 | 2 | 3)}>{label}</button>
      {/each}
    </div>
  </section>

  <section class="card block" aria-labelledby="tags-title">
    <h2 id="tags-title">Tags</h2>
    {#if meal.tags.length}
      <ul class="chips">
        {#each meal.tags as tag (tag)}
          <li><button type="button" class="chip on" onclick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>{tag} <span aria-hidden="true">×</span></button></li>
        {/each}
      </ul>
    {/if}
    {#if offered.length}
      <p class="muted small">Suggested. Tap to add:</p>
      <ul class="chips">
        {#each offered as tag (tag)}
          <li class="suggest">
            <button type="button" class="chip" onclick={() => acceptTag(tag)} aria-label={`Add tag ${tag}`}>+ {tag}</button>
            <button type="button" class="dismiss" onclick={() => dismissSuggestion(tag)} aria-label={`Dismiss suggestion ${tag}`}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
    <form class="inline" onsubmit={addTag}>
      <label class="visually-hidden" for="new-tag">New tag</label>
      <input id="new-tag" placeholder="Add a tag" maxlength="30" bind:value={newTag} />
      <button class="btn" type="submit">Add</button>
    </form>
  </section>

  <section class="card block" aria-labelledby="notes-title">
    <h2 id="notes-title">Notes for Claude</h2>
    <p class="muted small">Wrong group, wrong options, wrong tags? Say so and Claude will fix it.</p>
    {#each meal.notes as n (n.id)}
      <div class="note">
        <p><strong>{nameOf(n.createdBy)}:</strong> {n.body}</p>
        {#if n.reply}<p class="reply"><strong>Claude:</strong> {n.reply}</p>{:else}<p class="muted small">Waiting for Claude</p>{/if}
      </div>
    {/each}
    <form class="note-form" onsubmit={sendNote}>
      <label class="visually-hidden" for="note">Note for Claude</label>
      <textarea id="note" rows="3" maxlength="2000" placeholder="e.g. Kangaroo tacos should be its own meal" bind:value={note}></textarea>
      <button class="btn btn-primary" type="submit" disabled={sending || !note.trim()}>Send note</button>
    </form>
  </section>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if next}
    <a class="btn btn-primary next" href={`#/meals/${encodeURIComponent(next.id)}`}>Next: {next.name} ›</a>
  {/if}
{/if}

<style>
  .pager {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .pager .all {
    text-align: center;
    text-decoration: none;
    font-weight: 600;
  }
  .pager a[aria-disabled='true'] {
    opacity: 0.35;
    pointer-events: none;
  }
  .head {
    margin-bottom: 1rem;
  }
  .head h1 {
    font-size: 1.9rem;
  }
  .head p {
    margin: 0.3rem 0 0;
  }
  .tips {
    color: var(--herb);
    font-weight: 600;
  }
  .block {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .block-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  h2 {
    font-size: 1.2rem;
  }
  .seg {
    display: flex;
    gap: 0.4rem;
  }
  .seg button {
    flex: 1;
    min-height: 44px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
  }
  .seg button[aria-checked='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    min-height: 36px;
    padding: 0 0.8rem;
    border-radius: 999px;
    border: 1.5px dashed var(--border-strong);
    background: transparent;
    color: var(--text-muted);
    font-weight: 600;
    cursor: pointer;
  }
  .chip.on {
    border-style: solid;
    border-color: var(--herb);
    background: var(--herb-soft);
    color: var(--herb);
  }
  .suggest {
    display: flex;
    align-items: center;
  }
  .dismiss {
    width: 30px;
    height: 36px;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1.1rem;
  }
  .small {
    font-size: 0.85rem;
    margin: 0;
  }
  .inline {
    display: flex;
    gap: 0.5rem;
  }
  .inline input,
  textarea {
    flex: 1;
    min-height: 44px;
    padding: 0.55rem 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    font: inherit;
    color: inherit;
  }
  .note {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
  }
  .note p {
    margin: 0;
  }
  .reply {
    margin-top: 0.35rem !important;
    color: var(--herb);
  }
  .note-form {
    display: grid;
    gap: 0.5rem;
  }
  .note-form .btn {
    justify-self: start;
  }
  .next {
    width: 100%;
    margin-top: 0.5rem;
  }
</style>
