<script lang="ts">
  import { app, signIn } from '../lib/state.svelte'

  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state('')

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    busy = true
    error = ''
    try {
      await signIn(email.trim(), password)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }
</script>

<main class="login">
  <div class="panel">
    <!-- The mark: a week of nights, Monday to Sunday, in their produce colours. -->
    <div class="week-mark" aria-hidden="true">
      {#each [0, 1, 2, 3, 4, 5, 6] as d (d)}<span class={`day-${d}`}></span>{/each}
    </div>
    <h1>mealplan</h1>
    <p class="muted">Our week of dinners, and the ones worth making again.</p>
    <form onsubmit={submit}>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="email" required bind:value={email} />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" required bind:value={password} />
      </div>
      {#if error || app.error}
        <p class="error" role="alert">{error || app.error}</p>
      {/if}
      <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p class="muted small">Use your HealthLog email and password.</p>
  </div>
</main>

<style>
  .login {
    min-height: 100dvh;
    display: grid;
    align-items: center;
    padding: 1.5rem 1.25rem;
  }
  .panel {
    width: min(100%, 380px);
    margin: 0 auto;
    display: grid;
    gap: 0.75rem;
  }
  .week-mark {
    display: flex;
    gap: 5px;
    height: 44px;
    margin-bottom: 0.5rem;
  }
  .week-mark span {
    width: 10px;
    border-radius: 3px;
    background: var(--day);
  }
  h1 {
    font-size: 3.0625rem;
    font-stretch: 75%;
    line-height: 0.95;
  }
  p {
    margin: 0;
  }
  form {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }
</style>
