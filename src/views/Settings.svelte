<script lang="ts">
  import { api } from '../lib/api'
  import { WEEKDAY_NAMES } from '../lib/dates'
  import { app, refreshHousehold, setHousehold, signOut } from '../lib/state.svelte'

  let weekError = $state('')
  async function setWeekStart(event: Event): Promise<void> {
    const value = Number((event.currentTarget as HTMLSelectElement).value)
    weekError = ''
    try {
      setHousehold((await api.setHousehold({ weekStartDay: value })).household)
    } catch (e) {
      weekError = e instanceof Error ? e.message : String(e)
    }
  }

  const household = $derived(app.household)
  const partner = $derived(household?.partner ?? null)

  let email = $state('')
  let busy = $state(false)
  let error = $state('')

  async function savePartner(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    busy = true
    error = ''
    try {
      await api.setPartner(email.trim())
      await refreshHousehold()
      email = ''
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }
</script>

<h1>Settings</h1>

<section class="card block" aria-labelledby="household-title">
  <h2 id="household-title">Household</h2>
  {#if household}
    <ul class="members">
      {#each household.members as member (member.id)}
        <li>{member.name}{member.me ? ' (you)' : ''}</li>
      {/each}
    </ul>
  {/if}

  {#if partner?.status === 'linked'}
    <p class="muted">You share one meal plan with your partner.</p>
  {:else}
    {#if partner?.status === 'pending'}
      <p class="muted">
        Waiting for <strong>{partner.email}</strong> to add you back. They can do it here or in HealthLog settings.
      </p>
    {:else}
      <p class="muted">Add your partner's HealthLog email. Once you've both added each other, you share one plan.</p>
    {/if}
    <form onsubmit={savePartner}>
      <div class="field">
        <label for="partner-email">Partner's email</label>
        <input id="partner-email" type="email" autocomplete="off" required bind:value={email} />
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary" type="submit" disabled={busy}>{partner ? 'Change partner' : 'Add partner'}</button>
    </form>
  {/if}
</section>

<section class="card block" aria-labelledby="week-setting-title">
  <h2 id="week-setting-title">Week</h2>
  <div class="field">
    <label for="week-start">Our week starts on</label>
    <select id="week-start" value={household?.weekStartDay ?? 0} onchange={(e) => void setWeekStart(e)}>
      {#each WEEKDAY_NAMES as name, i (name)}
        <option value={i}>{name}</option>
      {/each}
    </select>
  </div>
  {#if weekError}<p class="error" role="alert">{weekError}</p>{/if}
</section>

<section class="card block" aria-labelledby="account-title">
  <h2 id="account-title">Account</h2>
  <p class="muted">Signed in as {app.user?.email}. Signing out here also signs you out of HealthLog on this device.</p>
  <button class="btn" type="button" onclick={() => void signOut()}>Sign out</button>
</section>

<style>
  h1 {
    margin-bottom: 1rem;
  }
  .block {
    display: grid;
    gap: 0.75rem;
    padding: 1.1rem 1.1rem 1.25rem;
    margin-bottom: 1rem;
  }
  h2 {
    font-size: 1.2rem;
  }
  p {
    margin: 0;
  }
  .members {
    margin: 0;
    padding-left: 1.1rem;
  }
  form {
    display: grid;
    gap: 0.75rem;
  }
  .block > .btn {
    justify-self: start;
  }
</style>
