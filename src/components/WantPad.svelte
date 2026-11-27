<script lang="ts">
  /**
   * The want-to-make scratch pad. Each line is a note in your own words
   * ("that miso eggplant from the Ottolenghi book, use the good miso"), with
   * how much you want it. The meal is found in the background; until then the
   * words are the want. Cooking the meal ticks the line off.
   */
  import { api } from '../lib/api'
  import { withOptions } from '../lib/format'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { app } from '../lib/state.svelte'
  import type { WantLevel, WantLine } from '../lib/types'
  import { addWants, LEVELS, levelLabel, linkWant, loadWants, removeWant, setWantLevel, setWantText, wants } from '../lib/wants.svelte'

  $effect(() => {
    void loadWants()
  })

  let draft = $state('')
  let draftEl = $state<HTMLTextAreaElement>()
  let draftLevel = $state<WantLevel>(2)
  let edits = $state<Record<string, string>>({}) // lines typed but not yet saved
  let saving = $state<Record<string, boolean>>({})
  let notice = $state('')

  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const nextLevel = (l: WantLevel): WantLevel => (l === 3 ? 1 : ((l + 1) as WantLevel))
  const twoOfUs = $derived((app.household?.members.length ?? 0) > 1)
  const nameOf = (id: string | null) => app.household?.members.find((m) => m.id === id)

  /** The meal a line is linked to, as words: "Dirty cabbage (Korean)". */
  function mealText(w: WantLine): string {
    const meal = meals.list.find((m) => m.id === w.dishId)
    if (!meal) return ''
    return withOptions(meal.name, meal.options.filter((o) => w.optionIds.includes(o.id)).map((o) => o.name))
  }

  /** Grow with the words, so a long note reads in full. */
  function grow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  function autosize(el: HTMLTextAreaElement) {
    queueMicrotask(() => grow(el))
  }

  const fail = (e: unknown) => (notice = e instanceof Error ? e.message : String(e))

  async function run(id: string, fn: () => Promise<void>): Promise<void> {
    saving[id] = true
    notice = ''
    try {
      await fn()
    } catch (e) {
      fail(e)
    } finally {
      delete saving[id]
    }
  }

  /** The new line: Return adds it and stays put for the next one. A paste of several lines adds each. */
  async function addDraft(): Promise<void> {
    const text = draft.trim()
    if (!text) return
    await run('new', async () => {
      await addWants(text, draftLevel)
      draft = ''
      if (draftEl) draftEl.style.height = 'auto'
    })
  }

  function onDraftKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void addDraft()
    }
  }

  /** Leaving a line saves it; emptied, it goes. */
  async function commit(w: WantLine): Promise<void> {
    const value = edits[w.id]
    if (value === undefined) return
    const text = value.trim()
    if (text === w.text) {
      delete edits[w.id]
      return
    }
    await run(w.id, async () => {
      if (text) await setWantText(w.id, text)
      else await removeWant(w.id)
      delete edits[w.id]
    })
  }

  function onLineKey(e: KeyboardEvent, w: WantLine): void {
    const el = e.currentTarget as HTMLTextAreaElement
    if (e.key === 'Escape') {
      delete edits[w.id]
      el.value = w.text
      grow(el)
      el.blur()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      el.blur()
    }
  }

  const cycle = (w: WantLine) => run(w.id, () => setWantLevel(w.id, nextLevel(w.level)))
  const link = (w: WantLine, dishId: string | null) =>
    run(w.id, async () => {
      await linkWant(w.id, dishId)
      // Picking a meal teaches it the words, when they're short enough to be a name.
      if (dishId && w.text.length <= 60) {
        await api.addAlias(dishId, w.text).catch(() => undefined)
        void loadMeals(true)
      }
    })
  const addNew = (w: WantLine) =>
    run(w.id, async () => {
      const name = w.text.split(/\s*(?:[,;:(\n]|\s[-–—]\s)/)[0].trim().slice(0, 80)
      const { meal } = await api.createMeal(name.replace(/^./, (c) => c.toUpperCase()))
      await loadMeals(true)
      await linkWant(w.id, meal.id)
    })
  const remove = (w: WantLine) => run(w.id, () => removeWant(w.id))
</script>

{#snippet pips(level: WantLevel)}
  <span class="pips" aria-hidden="true">{#each LEVELS as l (l.level)}<i class:on={l.level <= level}></i>{/each}</span>
{/snippet}

<section class="pad" aria-labelledby="want-title">
  <h1 id="want-title">Want to make</h1>
  <p class="muted intro">Meals you want to try, written however you like. They lift those meals in Ideas.</p>

  {#if wants.error}<p class="error" role="alert">{wants.error}</p>{/if}

  <ul class="lines">
    {#each wants.list as w (w.id)}
      {@const matched = mealText(w)}
      {@const who = twoOfUs ? nameOf(w.createdBy) : undefined}
      <li class={`want level-${w.level}`} class:saving={saving[w.id]}>
        <div class="row">
          <textarea
            class="line"
            rows="1"
            value={edits[w.id] ?? w.text}
            use:autosize
            oninput={(e) => ((edits[w.id] = e.currentTarget.value), grow(e.currentTarget))}
            onkeydown={(e) => onLineKey(e, w)}
            onblur={() => void commit(w)}
            aria-label="Want to make"
            autocapitalize="sentences"
            enterkeyhint="done"></textarea>
          <button type="button" class="how" onclick={() => void cycle(w)} aria-label={`How much: ${levelLabel(w.level)}. Tap to change`}>
            {@render pips(w.level)}<span>{levelLabel(w.level)}</span>
          </button>
        </div>
        <p class="under">
          {#if wants.matching[w.id]}
            <span class="muted">Finding the meal…</span>
          {:else if w.dishId && matched}
            {#if norm(matched) !== norm(w.text)}<span class="matched">{matched}</span>{/if}
            <a class="link quiet" href={`#/meals/${encodeURIComponent(w.dishId)}`}>{norm(matched) === norm(w.text) ? 'Meal page' : 'Open'}</a>
            <button type="button" class="link quiet" onclick={() => void link(w, null)}>Not this</button>
          {:else}
            {#each wants.guesses[w.id] ?? [] as c (c.dishId)}
              <button type="button" class="link" onclick={() => void link(w, c.dishId)}>{c.name}?</button>
            {/each}
            <button type="button" class="link quiet" onclick={() => void addNew(w)}>Add as new meal</button>
          {/if}
          <button type="button" class="link quiet" onclick={() => void remove(w)}>Remove</button>
          {#if who && !who.me}<span class="who muted">{who.name}'s</span>{/if}
        </p>
      </li>
    {/each}
    <li class="want new" class:saving={saving.new}>
      <div class="row">
        <textarea
          class="line"
          rows="1"
          bind:value={draft}
          bind:this={draftEl}
          oninput={(e) => grow(e.currentTarget)}
          onkeydown={onDraftKey}
          onblur={(e) => !(e.relatedTarget as HTMLElement | null)?.classList.contains('how-new') && void addDraft()}
          placeholder={wants.list.length ? 'Add another' : 'A meal, a recipe, a note…'}
          aria-label="Add something you want to make"
          autocapitalize="sentences"
          enterkeyhint="enter"></textarea>
        <button type="button" class="how how-new" onclick={() => (draftLevel = nextLevel(draftLevel))} aria-label={`How much, for the next one: ${levelLabel(draftLevel)}. Tap to change`}>
          {@render pips(draftLevel)}<span>{levelLabel(draftLevel)}</span>
        </button>
      </div>
    </li>
  </ul>
  {#if notice}<p class="error small" role="alert">{notice}</p>{/if}
</section>

<style>
  .pad {
    margin: 0 0 1.5rem;
  }
  h1 {
    margin-bottom: 0.25rem;
  }
  .intro {
    margin: 0 0 1rem;
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .want {
    border-bottom: 1px solid var(--rule);
    padding: 0.15rem 0 0.3rem;
  }
  .want.new {
    border-bottom: 1px dashed var(--rule-strong);
  }
  .want.saving {
    opacity: 0.55;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 0.5rem;
  }
  /* The line itself: reads as text, types as a note. */
  .line {
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0.55rem 0.25rem;
    border: 0;
    background: transparent;
    color: var(--plum);
    font: inherit;
    font-size: 1.125rem; /* 18px: no zoom on focus on iOS */
    line-height: 1.35;
    font-weight: 600;
    resize: none;
    overflow: hidden;
    outline: none;
  }
  .line::placeholder {
    color: var(--rule-strong);
    font-weight: 450;
  }
  .level-1 .line {
    font-weight: 500;
    color: var(--pepper);
  }
  .level-3 .line {
    font-weight: 750;
  }
  /* How much: three pips, tap to go round. */
  .how {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 36px;
    margin-top: 4px;
    padding: 0 0.65rem;
    border-radius: 999px;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--plum);
    font: inherit;
    font-size: var(--s-1);
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }
  .level-3 .how {
    background: var(--plum);
    border-color: var(--plum);
    color: var(--on-accent);
  }
  .level-1 .how {
    border-style: dashed;
    color: var(--pepper);
  }
  .new .how {
    color: var(--pepper);
  }
  .pips {
    display: inline-flex;
    gap: 2px;
  }
  .pips i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    opacity: 0.6;
  }
  .pips i.on {
    background: currentColor;
    opacity: 1;
  }
  .under {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.9rem;
    margin: -0.2rem 0 0 0.25rem;
    font-size: var(--s-1);
  }
  .matched {
    color: var(--leek);
    font-weight: 650;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--plum);
    font: inherit;
    font-weight: 650;
    text-decoration: underline;
    cursor: pointer;
  }
  .link.quiet {
    color: var(--pepper);
    font-weight: 550;
  }
  .who {
    margin-left: auto;
  }
</style>
