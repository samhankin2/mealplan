<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { api } from '../lib/api'
  import { shortDate, weekdayName } from '../lib/dates'
  import { loadMeals, meals } from '../lib/meals.svelte'
  import { loadWeek, searchMeals } from '../lib/plan.svelte'
  import type { Day, ParsedNight } from '../lib/types'

  let { start, onclose }: { start: Day; onclose: () => void } = $props()

  type Row = ParsedNight & { keep: boolean; corrected: boolean }

  let text = $state('')
  let rows = $state<Row[] | null>(null)
  let busy = $state(false)
  let error = $state('')
  let fixing = $state<number | null>(null) // row whose meal is being changed
  let fixQuery = $state('')

  const nameOf = (id: string | null) => meals.list.find((m) => m.id === id)?.name
  const optionNames = (r: Row) => {
    const meal = meals.list.find((m) => m.id === r.dishId)
    return meal ? meal.options.filter((o) => r.optionIds.includes(o.id)).map((o) => o.name) : []
  }
  const KIND_LABEL = { out: 'Out', leftovers: 'Leftovers', takeaway: 'Takeaway', freezer: 'From the freezer', dish: '' } as const

  async function match(): Promise<void> {
    busy = true
    error = ''
    try {
      const { items } = await api.parseWeek(start, text)
      rows = items.map((it) => ({ ...it, keep: true, corrected: false }))
      if (rows.length === 0) error = 'Nothing to plan in that. Try "mon katsu, tue out".'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  function choose(i: number, dishId: string | null): void {
    const r = rows![i]
    rows![i] = { ...r, dishId, optionIds: [], newName: dishId ? null : r.newName, confidence: 1, corrected: true }
    fixing = null
    fixQuery = ''
  }

  async function apply(): Promise<void> {
    if (!rows) return
    busy = true
    error = ''
    try {
      let created = false
      for (const r of rows.filter((x) => x.keep)) {
        if (r.kind !== 'dish') {
          await api.setNight(r.date, { kind: r.kind, raw: r.typed })
          continue
        }
        let dishId = r.dishId
        if (!dishId && r.newName) {
          dishId = (await api.createMeal(r.newName)).meal.id
          created = true
        }
        if (!dishId) continue
        await api.setNight(r.date, { kind: 'dish', dishId, optionIds: r.optionIds, raw: r.raw })
        // A correction teaches the matcher: next time this text means this meal.
        if (r.corrected) await api.addAlias(dishId, r.raw).catch(() => undefined)
      }
      if (created) await loadMeals(true)
      await loadWeek(start)
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }
</script>

<Sheet title="Type the week" {onclose}>
  {#if !rows}
    <p class="muted hint">One night per line or comma. Day names are optional: <em>mon katsu, tue out, dahl, fried rice prawn</em></p>
    <label class="visually-hidden" for="week-text">The week</label>
    <textarea id="week-text" rows="6" maxlength="2000" placeholder={'mon thai curry\ntue out\nwed fried rice prawn'} bind:value={text}></textarea>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary wide" type="button" disabled={busy || !text.trim()} onclick={() => void match()}>{busy ? 'Matching…' : 'Match meals'}</button>
  {:else}
    <p class="muted hint">Check these, then add them to the week. Nights already planned get replaced.</p>
    <ul class="rows">
      {#each rows as r, i (r.date + i)}
        <li class:off={!r.keep} class:unsure={r.kind === 'dish' && r.dishId !== null && r.confidence < 0.85 && !r.corrected}>
          <div class="day">
            <strong>{weekdayName(r.date)}</strong>
            <span class="muted">{shortDate(r.date)}</span>
          </div>
          <div class="what">
            {#if r.kind !== 'dish'}
              <span class="meal">{KIND_LABEL[r.kind]}</span>
            {:else if r.dishId}
              <span class="meal">{nameOf(r.dishId)}{#if optionNames(r).length}<span class="muted"> · {optionNames(r).join(' · ')}</span>{/if}</span>
            {:else}
              <span class="meal new">New: {r.newName}</span>
            {/if}
            <span class="typed muted">“{r.typed}”{r.kind === 'dish' && r.dishId && r.confidence < 0.85 && !r.corrected ? ' · check this' : ''}</span>
            {#if fixing === i}
              <label class="visually-hidden" for={`fix-${i}`}>Which meal?</label>
              <input id={`fix-${i}`} class="fix" type="search" placeholder="Which meal?" bind:value={fixQuery} />
              <div class="picks">
                {#each searchMeals(meals.list, fixQuery || r.raw, 5) as m (m.id)}
                  <button type="button" class="pick" onclick={() => choose(i, m.id)}>{m.name}</button>
                {/each}
                <button type="button" class="pick new" onclick={() => { rows![i] = { ...r, dishId: null, newName: fixQuery.trim() || r.raw, corrected: false }; fixing = null }}>+ New meal</button>
              </div>
            {/if}
          </div>
          <div class="acts">
            {#if r.kind === 'dish'}
              <button type="button" class="small" onclick={() => { fixing = fixing === i ? null : i; fixQuery = '' }}>{fixing === i ? 'Done' : 'Change'}</button>
            {/if}
            <button type="button" class="small" aria-pressed={!r.keep} onclick={() => (rows![i] = { ...r, keep: !r.keep })}>{r.keep ? 'Skip' : 'Keep'}</button>
          </div>
        </li>
      {/each}
    </ul>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="bottom">
      <button class="btn" type="button" onclick={() => (rows = null)}>Edit text</button>
      <button class="btn btn-primary" type="button" disabled={busy || !rows.some((r) => r.keep)} onclick={() => void apply()}>
        {busy ? 'Adding…' : `Add ${rows.filter((r) => r.keep).length} to the week`}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .hint {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
  }
  textarea {
    width: 100%;
    padding: 0.7rem 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    font: inherit;
    color: inherit;
  }
  .wide {
    width: 100%;
    margin-top: 0.75rem;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .rows li {
    display: grid;
    grid-template-columns: 4.2rem minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: start;
    padding: 0.55rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .rows li.unsure {
    border-color: #e2a33b;
    background: #fdf6e6;
  }
  .rows li.off {
    opacity: 0.45;
  }
  .day {
    display: grid;
    line-height: 1.2;
    font-size: 0.9rem;
  }
  .what {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .meal {
    font-weight: 600;
  }
  .meal.new {
    color: var(--accent);
  }
  .typed {
    font-size: 0.8rem;
  }
  .acts {
    display: grid;
    gap: 0.3rem;
  }
  .small {
    min-height: 32px;
    padding: 0 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .fix {
    margin-top: 0.35rem;
    min-height: 40px;
    padding: 0 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--bg);
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .pick {
    min-height: 34px;
    padding: 0 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--bg);
    color: var(--text);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .pick.new {
    border-style: dashed;
    color: var(--accent);
  }
  .bottom {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.85rem;
  }
</style>
