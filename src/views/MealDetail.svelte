<script lang="ts">
  import Chevron from '../components/Chevron.svelte'
  import { onMount } from 'svelte'
  import PersonaPicker from '../components/PersonaPicker.svelte'
  import RateRows from '../components/RateRows.svelte'
  import AddPhoto from '../components/AddPhoto.svelte'
  import Photo from '../components/Photo.svelte'
  import { api } from '../lib/api'
  import { shortDate, today } from '../lib/dates'
  import { removePhoto } from '../lib/photos.svelte'
  import { addNote, loadMeals, meals, persona, ratedParts, removeMeal, saveMeal, sortedMeals } from '../lib/meals.svelte'
  import type { Meal } from '../lib/types'
  import { loadWants } from '../lib/wants.svelte'
  import { app } from '../lib/state.svelte'

  let { id }: { id: string } = $props()

  let error = $state('')
  let newTag = $state('')
  let note = $state('')
  let sending = $state(false)

  onMount(() => {
    void loadMeals()
    void loadWants() // a variation on the want-to-make list counts as answered
  })

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

  function remove(m: Meal): void {
    if (!window.confirm(`Remove ${m.name} from the list? Its history and ratings are kept.`)) return
    void run(async () => {
      await removeMeal(m)
      window.location.hash = '#/meals'
    })
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
    <a class="btn btn-icon" href={prev ? `#/meals/${encodeURIComponent(prev.id)}` : undefined} aria-disabled={!prev} aria-label="Previous meal"><Chevron dir="left" /></a>
    <a class="all muted" href="#/meals">{index + 1} of {order.length}</a>
    <a class="btn btn-icon" href={next ? `#/meals/${encodeURIComponent(next.id)}` : undefined} aria-disabled={!next} aria-label="Next meal"><Chevron /></a>
  </nav>

  <header class="head">
    {#if meal.coverPhotoId}<div class="cover"><Photo id={meal.coverPhotoId} alt={meal.name} size="lg" /></div>{/if}
    <h1>{meal.name}</h1>
    <p class="muted">
      {meal.family ? `Part of ${meal.family}. ` : ''}{meal.cooked ? `Made ${meal.cooked} time${meal.cooked === 1 ? '' : 's'}.` : 'From the recipe list.'}{meal.aliases.length ? ` Also called “${meal.aliases.slice(0, 3).join('”, “')}”.` : ''}
    </p>
    {#if meal.tips}<p class="tips">Tip: {meal.tips}</p>{/if}
    {#each meal.tipSuggestions as t (t.note)}
      <p class="tip-offer">
        You've noted “{t.note}” {t.count}×.
        <button type="button" class="link" onclick={() => void run(() => saveMeal(meal.id, { tips: [meal.tips, t.note.replace(/^./, (c) => c.toUpperCase())].filter(Boolean).join('. ') }))}>Make it a tip</button>
      </p>
    {/each}
  </header>

  <section class="card block" aria-labelledby="photos-title">
    <h2 id="photos-title">Photos</h2>
    {#if meal.photos.length}
      <ul class="photos">
        {#each meal.photos as p (p.id)}
          <li>
            <Photo id={p.id} alt={`${meal.name}, ${p.createdAt.slice(0, 10)}`} />
            <span class="photo-acts">
              {#if meal.coverPhotoId === p.id}
                <span class="muted small">Cover</span>
              {:else}
                <button type="button" class="link small" onclick={() => void run(() => saveMeal(meal.id, { coverPhotoId: p.id }))}>Make cover</button>
              {/if}
              <button type="button" class="link small danger" aria-label={`Delete photo from ${p.createdAt.slice(0, 10)}`} onclick={() => window.confirm('Delete this photo?') && void run(() => removePhoto(p.id))}>Delete</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <AddPhoto dishId={meal.id} />
  </section>

  <section class="card block" aria-labelledby="suggest-title">
    <h2 id="suggest-title">Suggestions</h2>
    <div class="field">
      <label for="regular">Regular</label>
      <select id="regular" value={meal.regularEveryDays ?? 0} onchange={(e) => void run(() => saveMeal(meal.id, { regularEveryDays: Number((e.currentTarget as HTMLSelectElement).value) || null }))}>
        <option value={0}>Not a regular</option>
        <option value={7}>Every week</option>
        <option value={14}>Every 2 weeks</option>
        <option value={21}>Every 3 weeks</option>
        <option value={28}>Every 4 weeks</option>
        <option value={42}>Every 6 weeks</option>
      </select>
    </div>
    <label class="check">
      <input type="checkbox" checked={meal.neverSuggest} onchange={(e) => void run(() => saveMeal(meal.id, { neverSuggest: (e.currentTarget as HTMLInputElement).checked }))} />
      Never suggest this
    </label>
    {#if meal.snoozedUntil && meal.snoozedUntil >= today()}
      <p class="muted small">Not now until {shortDate(meal.snoozedUntil)}. <button type="button" class="link small" onclick={() => void run(async () => { await api.snooze(meal.id, today(), 0); await loadMeals(true) })}>Suggest again</button></p>
    {/if}
  </section>

  <section class="card block" aria-labelledby="rate-title">
    <div class="block-head">
      <h2 id="rate-title">Rating</h2>
      <PersonaPicker />
    </div>
    {#if ratedParts(meal, persona.value)[1] > 1}<p class="muted small">{ratedParts(meal, persona.value)[0]} of {ratedParts(meal, persona.value)[1]} variations rated</p>{/if}
    <RateRows {meal} ratedAs={persona.value} onerror={(m) => (error = m)} onremove={remove} />
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
    <a class="btn btn-primary next" href={`#/meals/${encodeURIComponent(next.id)}`}>Next: {next.name}</a>
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
  .cover {
    margin-bottom: 0.75rem;
  }
  .tip-offer {
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-sm);
    background: var(--herb-soft);
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }
  .danger {
    color: var(--danger);
  }
  .photos {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .photos li {
    display: grid;
    gap: 0.25rem;
  }
  .photo-acts {
    display: flex;
    gap: 0.5rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }
  .check input {
    width: 20px;
    height: 20px;
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
