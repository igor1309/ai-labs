<script lang="ts">
  import { onDestroy } from "svelte";

  import type { AuthSession, AuthState } from "./auth/AuthSession";
  import type { BrowseItemsReader } from "./browse/BrowseItemsReader";
  import BrowseView from "./browse/BrowseView.svelte";

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
</script>

<main>
  {#if authState.status === "checking"}
    <p>Checking session...</p>
  {:else if authState.status === "unauthenticated"}
    <form aria-label="Sign in" on:submit|preventDefault={signIn}>
      <label>
        Email
        <input bind:value={email} name="email" required type="email" />
      </label>
      <button type="submit">Send magic link</button>
    </form>
    {#if signInSent}
      <p role="status">Check your email for the magic link.</p>
    {/if}
    {#if signInError !== null}
      <p role="alert">{signInError}</p>
    {/if}
  {:else}
    <header>
      <p>{authState.email}</p>
      <button on:click={signOut} type="button">Sign out</button>
    </header>
    <BrowseView authState={authSession} onUnauthorized={transitionToUnauthenticated} {reader} />
  {/if}
</main>
