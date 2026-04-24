<script lang="ts">
  import { onDestroy } from "svelte";

  import type { AuthSession, AuthState } from "./auth/AuthSession";
  import type { BrowseItemsReader } from "./browse/BrowseItemsReader";
  import BrowseView from "./browse/BrowseView.svelte";
  import { frontendVersion } from "./version";

  export let authSession: AuthSession;
  export let reader: BrowseItemsReader;

  let authState: AuthState = { status: "checking" };
  let email = "";
  let signInError: string | null = null;
  let signInSent = false;

  const unsubscribe = authSession.subscribe((nextState) => {
    authState = nextState;
    if (nextState.status === "authenticated") {
      signInError = null;
      signInSent = false;
    }
  });

  onDestroy(() => {
    unsubscribe();
  });

  async function signIn(): Promise<void> {
    signInError = null;
    signInSent = false;

    try {
      await authSession.signIn(email.trim());
      signInSent = true;
    } catch {
      signInError = "Failed to send magic link.";
    }
  }

  async function signOut(): Promise<void> {
    await authSession.signOut();
  }

  function transitionToUnauthenticated(): void {
    authState = { status: "unauthenticated" };
  }

  function handleMouseMove(e: MouseEvent): void {
    const card = e.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mouse-x", (e.clientX - rect.left) + "px");
    card.style.setProperty("--mouse-y", (e.clientY - rect.top) + "px");
  }
</script>

<main>
  {#if authState.status === "checking"}
    <p class="checking">Checking session...</p>
  {:else if authState.status === "unauthenticated"}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="login-card" on:mousemove={handleMouseMove}>
      <h1 class="login-title"><span>Notio</span></h1>
      <p class="login-subtitle">Sign in with a magic link</p>
      <form aria-label="Sign in" on:submit|preventDefault={signIn}>
        <div class="field">
          <label class="field-label" for="email">Email</label>
          <input bind:value={email} class="field-input" id="email" name="email" placeholder="you@example.com" required type="email" />
        </div>
        <button class="submit-btn" type="submit">Send magic link</button>
      </form>
      {#if signInSent}
        <p class="status-msg success" role="status">Check your email for the magic link.</p>
      {/if}
      {#if signInError !== null}
        <p class="status-msg error" role="alert">{signInError}</p>
      {/if}
    </div>
  {:else}
    <header class="app-header">
      <p>{authState.email}</p>
      <button class="signout-btn" on:click={signOut} type="button">Sign out</button>
    </header>
    <BrowseView authState={authSession} onUnauthorized={transitionToUnauthenticated} {reader} />
  {/if}
  <p aria-label="Version" class="version">v{frontendVersion}</p>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f1117;
    color: #e1e4ed;
    min-height: 100vh;
  }

  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .login-card {
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 16px;
    padding: 2.5rem;
    width: 100%;
    max-width: 380px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
    animation: fadeUp 0.5s ease both;
  }

  .login-card:hover {
    border-color: rgba(108, 99, 255, 0.3);
    box-shadow: 0 16px 48px -16px rgba(108, 99, 255, 0.12);
  }

  .login-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(108, 99, 255, 0.1), transparent 40%);
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }

  .login-card:hover::before {
    opacity: 1;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .login-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.25rem;
    text-align: center;
  }

  .login-title span {
    color: #8b83ff;
  }

  .login-subtitle {
    color: #8b8fa3;
    font-size: 0.85rem;
    text-align: center;
    margin-bottom: 1.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8b8fa3;
  }

  .field-input {
    background: #0f1117;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    padding: 0.7rem 0.9rem;
    font-size: 0.9rem;
    color: #e1e4ed;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .field-input:focus {
    border-color: #6c63ff;
    box-shadow: 0 0 0 3px rgba(108, 99, 255, 0.15);
  }

  .field-input::placeholder {
    color: #4a4d5e;
  }

  .submit-btn {
    width: 100%;
    padding: 0.7rem;
    border: none;
    border-radius: 8px;
    background: #6c63ff;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
  }

  .submit-btn:hover {
    background: #5b54e6;
  }

  .submit-btn:active {
    transform: scale(0.98);
  }

  .status-msg {
    margin-top: 1rem;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    font-size: 0.8rem;
    text-align: center;
  }

  .status-msg.success {
    color: #3ecf8e;
    background: rgba(62, 207, 142, 0.08);
    border: 1px solid rgba(62, 207, 142, 0.2);
  }

  .status-msg.error {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
  }

  .checking {
    color: #8b8fa3;
    font-size: 0.9rem;
    animation: fadeUp 0.4s ease both;
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 960px;
    padding: 1rem 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid #2a2d3a;
    animation: fadeUp 0.4s ease both;
  }

  .app-header p {
    color: #8b8fa3;
    font-size: 0.85rem;
  }

  .signout-btn {
    background: transparent;
    border: 1px solid #2a2d3a;
    border-radius: 6px;
    padding: 0.35rem 0.75rem;
    color: #8b8fa3;
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .signout-btn:hover {
    border-color: #6c63ff;
    color: #e1e4ed;
  }

  .version {
    color: #4a4d5e;
    font-size: 0.7rem;
    margin-top: 1.5rem;
    text-align: center;
  }
</style>
