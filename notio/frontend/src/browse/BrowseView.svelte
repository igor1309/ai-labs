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
    <p class="status-text">Loading...</p>
  {:else if state.status === "refreshing"}
    <p class="status-text">Refreshing...</p>
    <ul class="item-grid">
      {#each state.items as item (item.id)}
        <li class="item-card">
          <article>
            <div class="item-header">
              <span class="item-kind">{item.kind}</span>
              <span class="item-date">{item.capturedAt}</span>
            </div>
            {#if item.capturedTitle !== null}
              <p class="item-title">{item.capturedTitle}</p>
            {/if}
            {#if item.capturedDescription !== null}
              <p class="item-desc">{item.capturedDescription}</p>
            {/if}
            {#if item.url !== null}
              <a class="item-link" href={item.url} rel="noreferrer noopener" target="_blank">{item.url}</a>
            {/if}
            {#if item.note !== null}
              <p class="item-note">{item.note}</p>
            {/if}
            <div class="item-meta">
              {#if item.sourceType !== null}
                <span class="item-tag">{item.sourceType}</span>
              {/if}
              <span class="item-tag">{item.enrichment}</span>
            </div>
          </article>
        </li>
      {/each}
    </ul>
  {:else if state.status === "loaded"}
    <div class="toolbar">
      <button class="action-btn" on:click={refresh} type="button">Refresh</button>
    </div>
    {#if state.loadMoreError !== null}
      <p class="error-msg" role="alert">{state.loadMoreError}</p>
    {/if}
    <ul class="item-grid">
      {#each state.items as item (item.id)}
        <li class="item-card">
          <article>
            <div class="item-header">
              <span class="item-kind">{item.kind}</span>
              <span class="item-date">{item.capturedAt}</span>
            </div>
            {#if item.capturedTitle !== null}
              <p class="item-title">{item.capturedTitle}</p>
            {/if}
            {#if item.capturedDescription !== null}
              <p class="item-desc">{item.capturedDescription}</p>
            {/if}
            {#if item.url !== null}
              <a class="item-link" href={item.url} rel="noreferrer noopener" target="_blank">{item.url}</a>
            {/if}
            {#if item.note !== null}
              <p class="item-note">{item.note}</p>
            {/if}
            <div class="item-meta">
              {#if item.sourceType !== null}
                <span class="item-tag">{item.sourceType}</span>
              {/if}
              <span class="item-tag">{item.enrichment}</span>
            </div>
          </article>
        </li>
      {/each}
    </ul>
    {#if state.hasMore}
      <div class="toolbar">
        <button class="action-btn" on:click={loadMore} type="button">Load more</button>
      </div>
    {/if}
  {:else if state.status === "empty"}
    <p class="status-text">No items found.</p>
  {:else if state.status === "failed"}
    <p class="error-msg">{state.message}</p>
  {:else if state.status === "unauthorized"}
    <p class="status-text">Unauthorized</p>
  {:else}
    <p class="status-text">Not implemented</p>
  {/if}
</section>

<style>
  section {
    width: 100%;
    max-width: 960px;
  }

  .status-text {
    color: #8b8fa3;
    font-size: 0.9rem;
    text-align: center;
  }

  .error-msg {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    font-size: 0.8rem;
    text-align: center;
    margin-bottom: 1rem;
  }

  .toolbar {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .action-btn {
    background: transparent;
    border: 1px solid #2a2d3a;
    border-radius: 6px;
    padding: 0.4rem 1rem;
    color: #8b8fa3;
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .action-btn:hover {
    border-color: #6c63ff;
    color: #e1e4ed;
  }

  .item-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @media (min-width: 800px) {
    .item-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .item-card {
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    padding: 1.25rem;
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .item-card:hover {
    transform: translateY(-2px);
    border-color: rgba(108, 99, 255, 0.3);
    box-shadow: 0 12px 36px -12px rgba(108, 99, 255, 0.1);
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .item-kind {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8b83ff;
    background: rgba(108, 99, 255, 0.1);
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .item-date {
    font-size: 0.7rem;
    color: #4a4d5e;
  }

  .item-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #e1e4ed;
    margin-bottom: 0.35rem;
    line-height: 1.4;
  }

  .item-desc {
    font-size: 0.8rem;
    color: #8b8fa3;
    line-height: 1.5;
    margin-bottom: 0.5rem;
  }

  .item-link {
    display: block;
    font-size: 0.75rem;
    color: #6c63ff;
    text-decoration: none;
    word-break: break-all;
    margin-bottom: 0.5rem;
    transition: color 0.2s;
  }

  .item-link:hover {
    color: #8b83ff;
  }

  .item-note {
    font-size: 0.8rem;
    color: #8b8fa3;
    font-style: italic;
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  .item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.5rem;
  }

  .item-tag {
    font-size: 0.65rem;
    color: #8b8fa3;
    border: 1px solid #2a2d3a;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
  }
</style>
