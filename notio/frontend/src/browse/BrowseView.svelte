<script lang="ts">
  import { onDestroy } from "svelte";

  import type { AuthState, AuthStateReader } from "../auth/AuthSession";
  import { PAGE_SIZE, UnauthorizedError, type BrowseItemsReader, type Page } from "./BrowseItemsReader";
  import type { BrowseState } from "./BrowseState";

  export let authState: AuthStateReader;
  export let onUnauthorized: () => void;
  export let reader: BrowseItemsReader;

  let requestVersion = 0;
  let state: BrowseState = { status: "loading" };
  let latestAuthStatus: AuthState["status"] | null = null;
  let nextCursor: { capturedAt: string; id: string } | null = null;
  let loadingMore = false;

  const unsubscribe = authState.subscribe((value) => {
    handleAuthStateChange(value);
  });

  onDestroy(() => {
    requestVersion += 1;
    unsubscribe();
  });

  async function refresh(): Promise<void> {
    if (state.status !== "loaded") {
      return;
    }

    const currentItems = state.items;
    state = { items: currentItems, status: "refreshing" };

    const requestId = beginRequest();
    try {
      const page = await reader.fetchFirstPage();
      if (!isCurrentRequest(requestId)) {
        return;
      }

      applyFetchedFirstPage(page);
    } catch (error: unknown) {
      if (!isCurrentRequest(requestId)) {
        return;
      }

      handleFirstPageError(error);
    }
  }

  async function loadMore(): Promise<void> {
    if (state.status !== "loaded" || nextCursor === null || loadingMore) {
      return;
    }

    const currentItems = state.items;
    const cursor = nextCursor;
    const activeRequest = requestVersion;
    loadingMore = true;
    state = {
      ...state,
      loadMoreError: null
    };

    try {
      const page = await reader.fetchAfter(cursor);
      if (!isCurrentRequest(activeRequest) || state.status !== "loaded") {
        return;
      }

      nextCursor = page.nextCursor;
      state = {
        hasMore: page.nextCursor !== null,
        items: [...currentItems, ...page.items.slice(0, PAGE_SIZE)],
        loadMoreError: null,
        status: "loaded"
      };
    } catch (error: unknown) {
      if (!isCurrentRequest(activeRequest) || state.status !== "loaded") {
        return;
      }
      if (error instanceof UnauthorizedError) {
        transitionToUnauthorized();
        return;
      }

      state = {
        ...state,
        loadMoreError: toErrorMessage(error)
      };
    } finally {
      loadingMore = false;
    }
  }

  function beginRequest(): number {
    requestVersion += 1;
    return requestVersion;
  }

  function isCurrentRequest(requestId: number): boolean {
    return requestId === requestVersion;
  }

  function handleAuthStateChange(value: AuthState): void {
    if (value.status === "checking") {
      requestVersion += 1;
      latestAuthStatus = value.status;
      state = { status: "loading" };
      return;
    }
    if (value.status === "unauthenticated") {
      latestAuthStatus = value.status;
      transitionToUnauthorized();
      return;
    }

    const wasAuthenticated = latestAuthStatus === "authenticated";
    latestAuthStatus = "authenticated";
    if (wasAuthenticated && state.status !== "unauthorized") {
      return;
    }

    void loadFirstPage();
  }

  function applyFetchedFirstPage(page: Page): void {
    const items = page.items.slice(0, PAGE_SIZE);

    nextCursor = page.nextCursor;
    if (items.length === 0) {
      state = { status: "empty" };
      return;
    }

    state = {
      hasMore: page.nextCursor !== null,
      items,
      loadMoreError: null,
      status: "loaded"
    };
  }

  function handleFirstPageError(error: unknown): void {
    if (error instanceof UnauthorizedError) {
      transitionToUnauthorized();
      return;
    }

    state = {
      message: toErrorMessage(error),
      status: "failed"
    };
  }

  async function loadFirstPage(): Promise<void> {
    state = { status: "loading" };

    const requestId = beginRequest();
    try {
      const page = await reader.fetchFirstPage();
      if (!isCurrentRequest(requestId)) {
        return;
      }

      applyFetchedFirstPage(page);
    } catch (error: unknown) {
      if (!isCurrentRequest(requestId)) {
        return;
      }

      handleFirstPageError(error);
    }
  }

  function transitionToUnauthorized(): void {
    requestVersion += 1;
    nextCursor = null;
    loadingMore = false;
    if (state.status === "unauthorized") {
      return;
    }

    state = { status: "unauthorized" };
    onUnauthorized();
  }

  function toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return "Failed to load captured items";
  }
</script>

<section data-status={state.status} data-testid="browse-view">
  {#if state.status === "loading"}
    <p>Loading...</p>
  {:else if state.status === "refreshing"}
    <p>Refreshing...</p>
    <ul>
      {#each state.items as item (item.id)}
        <li>
          <article>
            <p>{item.kind}</p>
            <p>{item.capturedAt}</p>
            {#if item.capturedTitle !== null}
              <p>{item.capturedTitle}</p>
            {/if}
            {#if item.capturedDescription !== null}
              <p>{item.capturedDescription}</p>
            {/if}
            {#if item.url !== null}
              <a href={item.url} rel="noreferrer noopener" target="_blank">{item.url}</a>
            {/if}
            {#if item.note !== null}
              <p>{item.note}</p>
            {/if}
            {#if item.sourceType !== null}
              <p>{item.sourceType}</p>
            {/if}
            <p>{item.enrichment}</p>
          </article>
        </li>
      {/each}
    </ul>
  {:else if state.status === "loaded"}
    <button on:click={refresh} type="button">Refresh</button>
    {#if state.loadMoreError !== null}
      <p role="alert">{state.loadMoreError}</p>
    {/if}
    <ul>
      {#each state.items as item (item.id)}
        <li>
          <article>
            <p>{item.kind}</p>
            <p>{item.capturedAt}</p>
            {#if item.capturedTitle !== null}
              <p>{item.capturedTitle}</p>
            {/if}
            {#if item.capturedDescription !== null}
              <p>{item.capturedDescription}</p>
            {/if}
            {#if item.url !== null}
              <a href={item.url} rel="noreferrer noopener" target="_blank">{item.url}</a>
            {/if}
            {#if item.note !== null}
              <p>{item.note}</p>
            {/if}
            {#if item.sourceType !== null}
              <p>{item.sourceType}</p>
            {/if}
            <p>{item.enrichment}</p>
          </article>
        </li>
      {/each}
    </ul>
    {#if state.hasMore}
      <button on:click={loadMore} type="button">Load more</button>
    {/if}
  {:else if state.status === "empty"}
    <p>No items found.</p>
    <button on:click={refresh} type="button">Refresh</button>
  {:else if state.status === "failed"}
    <p>{state.message}</p>
  {:else if state.status === "unauthorized"}
    <p>Unauthorized</p>
  {:else}
    <p>Not implemented</p>
  {/if}
</section>
