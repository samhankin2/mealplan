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
  <div class="card panel">
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
    <p class="muted small">Sign in with your HealthLog account.</p>
  </div>
</main>

<style>
  .login {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .panel {
    width: min(100%, 380px);
    padding: 1.75rem 1.5rem;
    display: grid;
    gap: 0.75rem;
  }
  h1 {
    font-size: 2rem;
    color: var(--accent);
  }
  p {
    margin: 0;
  }
  form {
    display: grid;
    gap: 1rem;
    margin-top: 0.5rem;
  }
  .small {
    font-size: 0.875rem;
  }
</style>
