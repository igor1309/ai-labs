import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable, type Writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";

import type { AuthState } from "../../src/auth/AuthSession";
import { PAGE_SIZE, ReaderError, UnauthorizedError, type BrowseItemsReader, type CapturedItem, type Page, type PageCursor } from "../../src/browse/BrowseItemsReader";
import { BROWSE_STATUS_VALUES } from "../../src/browse/BrowseState";
import BrowseView from "../../src/browse/BrowseView.svelte";

describe("BrowseView", () => {
  it("browseStatus shouldMatchAdrStateSet_onExportedValues", () => {
    expect(new Set(BROWSE_STATUS_VALUES)).toEqual(new Set(["loading", "refreshing", "loaded", "empty", "failed", "unauthorized"]));
  });

  it("mount shouldStartLoadingAndLoadFirstPage_onAuthenticatedAuthState", async () => {
    const firstPage = makeDeferred<Page>();
    const reader = makeReaderDouble({
      firstPageOutcomes: [firstPage.promise]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });

    expect(readStatus()).toBe("loading");
    expect(reader.fetchFirstPageCallCount).toBe(1);

    firstPage.resolve(makePage([makeCapturedItem(1)], null));
    await waitFor(() => expect(readStatus()).toBe("loaded"));
  });

  it("mount shouldStartLoadingWithoutReaderCall_onCheckingAuthState", () => {
    const reader = makeReaderDouble({});

    renderBrowseView({ initialAuthState: { status: "checking" }, reader });

    expect(readStatus()).toBe("loading");
    expect(reader.fetchFirstPageCallCount).toBe(0);
  });

  it("authResolution shouldLoadFirstPage_onCheckingToAuthenticatedTransition", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], null)]
    });
    const { authState } = renderBrowseView({ initialAuthState: { status: "checking" }, reader });

    authState.set(makeAuthenticatedState());

    await waitFor(() => expect(reader.fetchFirstPageCallCount).toBe(1));
    await waitFor(() => expect(readStatus()).toBe("loaded"));
  });

  it("mount shouldTransitionToUnauthorizedWithoutReaderCall_onUnauthenticatedAuthState", () => {
    const onUnauthorized = vi.fn();
    const reader = makeReaderDouble({});

    renderBrowseView({ initialAuthState: { status: "unauthenticated" }, onUnauthorized, reader });

    expect(readStatus()).toBe("unauthorized");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(reader.fetchFirstPageCallCount).toBe(0);
  });

  it("initialLoad shouldNotCallUnauthorizedCallback_onPersistedAuthenticatedSession", async () => {
    const onUnauthorized = vi.fn();
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), onUnauthorized, reader });

    await waitFor(() => expect(readStatus()).toBe("loaded"));
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("initialLoad shouldTransitionToLoadedWithHasMoreTrue_onNonEmptyPageWithCursor", async () => {
    const item = makeCapturedItem(1);
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([item], makeCursor(item))]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });

    await waitFor(() => expect(readStatus()).toBe("loaded"));
    expect(screen.getByRole("button", { name: "Load more" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("initialLoad shouldTransitionToLoadedWithHasMoreFalse_onNonEmptyPageWithoutCursor", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });

    await waitFor(() => expect(readStatus()).toBe("loaded"));
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("initialLoad shouldTransitionToEmpty_onZeroItems", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });

    await waitFor(() => expect(readStatus()).toBe("empty"));
  });

  it("emptyState shouldNotRenderRefreshButton_onEmptyPage", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("empty"));

    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("initialLoad shouldTransitionToFailed_onReaderError", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [new ReaderError("failed to load")]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });

    await waitFor(() => expect(readStatus()).toBe("failed"));
    expect(screen.getByText("failed to load")).toBeDefined();
  });

  it("initialLoad shouldTransitionToUnauthorizedAndCallCallback_onUnauthorizedError", async () => {
    const onUnauthorized = vi.fn();
    const reader = makeReaderDouble({
      firstPageOutcomes: [new UnauthorizedError("unauthorized")]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), onUnauthorized, reader });

    await waitFor(() => expect(readStatus()).toBe("unauthorized"));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("refresh shouldTransitionToRefreshingAndPreserveItems_onUserAction", async () => {
    const firstPage = makePage([makeCapturedItem(1)], makeCursor(makeCapturedItem(1)));
    const refreshPage = makeDeferred<Page>();
    const reader = makeReaderDouble({
      firstPageOutcomes: [firstPage, refreshPage.promise]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(readStatus()).toBe("refreshing");
    expect(screen.getByText("Title 1")).toBeDefined();

    refreshPage.resolve(makePage([makeCapturedItem(2)], null));
    await waitFor(() => expect(readStatus()).toBe("loaded"));
  });

  it("refresh shouldReplaceItems_onSuccessfulRefresh", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], makeCursor(makeCapturedItem(1))), makePage([makeCapturedItem(2)], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));
    expect(screen.getByText("Title 1")).toBeDefined();

    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    expect(screen.queryByText("Title 1")).toBeNull();
    expect(screen.getByText("Title 2")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("refresh shouldTransitionToFailed_onReaderError", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], makeCursor(makeCapturedItem(1))), new ReaderError("refresh failed")]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(readStatus()).toBe("failed"));
    expect(screen.getByText("refresh failed")).toBeDefined();
  });

  it("refresh shouldTransitionToUnauthorizedAndCallCallback_onUnauthorizedError", async () => {
    const onUnauthorized = vi.fn();
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], makeCursor(makeCapturedItem(1))), new UnauthorizedError("refresh unauthorized")]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), onUnauthorized, reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(readStatus()).toBe("unauthorized"));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("loadMore shouldCallFetchAfterWithCurrentCursorAndAppendItems_onSuccess", async () => {
    const firstItem = makeCapturedItem(1);
    const secondItem = makeCapturedItem(2);
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([firstItem], makeCursor(firstItem))],
      fetchAfterOutcomes: [makePage([secondItem], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(screen.getByText("Title 2")).toBeDefined());
    expect(reader.fetchAfterCursors).toEqual([makeCursor(firstItem)]);
    expect(screen.getByText("Title 1")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("loadMore shouldPreserveItemsAndSetError_onReaderError", async () => {
    const firstItem = makeCapturedItem(1);
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([firstItem], makeCursor(firstItem))],
      fetchAfterOutcomes: [new ReaderError("load more failed")]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("load more failed"));
    expect(readStatus()).toBe("loaded");
    expect(screen.getByText("Title 1")).toBeDefined();
  });

  it("loadMoreRetry shouldClearErrorBeforeRequest_onSubsequentAttempt", async () => {
    const firstItem = makeCapturedItem(1);
    const secondRequest = makeDeferred<Page>();
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([firstItem], makeCursor(firstItem))],
      fetchAfterOutcomes: [new ReaderError("load more failed"), secondRequest.promise]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());

    await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.queryByRole("alert")).toBeNull();

    secondRequest.resolve(makePage([makeCapturedItem(2)], null));
    await waitFor(() => expect(screen.getByText("Title 2")).toBeDefined());
  });

  it("loadMore shouldTransitionToUnauthorizedAndCallCallback_onUnauthorizedError", async () => {
    const onUnauthorized = vi.fn();
    const firstItem = makeCapturedItem(1);
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([firstItem], makeCursor(firstItem))],
      fetchAfterOutcomes: [new UnauthorizedError("load more unauthorized")]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), onUnauthorized, reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    await fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(readStatus()).toBe("unauthorized"));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("authChange shouldTransitionToUnauthorizedFromLoadedState_onUnauthenticatedTransition", async () => {
    const onUnauthorized = vi.fn();
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], null)]
    });
    const { authState } = renderBrowseView({ initialAuthState: makeAuthenticatedState(), onUnauthorized, reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    authState.set({ status: "unauthenticated" });

    await waitFor(() => expect(readStatus()).toBe("unauthorized"));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("authChange shouldLoadFirstPageFromUnauthorized_onAuthenticatedTransition", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], null)]
    });
    const { authState } = renderBrowseView({ initialAuthState: { status: "unauthenticated" }, reader });

    authState.set(makeAuthenticatedState());

    await waitFor(() => expect(reader.fetchFirstPageCallCount).toBe(1));
    await waitFor(() => expect(readStatus()).toBe("loaded"));
  });

  it("render shouldDisplayKnownAndUnknownFieldsAndOmitNulls_onLoadedItems", async () => {
    const reader = makeReaderDouble({
      firstPageOutcomes: [
        makePage(
          [
            makeCapturedItem(1, {
              capturedDescription: null,
              capturedTitle: null,
              enrichment: "custom_enrichment",
              kind: "custom_kind",
              note: null,
              sourceType: "custom_source",
              url: "https://example.com/1"
            }),
            makeCapturedItem(2, {
              capturedDescription: "Description 2",
              capturedTitle: "Title 2",
              note: "Note 2",
              sourceType: null,
              url: null
            })
          ],
          null
        )
      ]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    expect(screen.getByText("custom_kind")).toBeDefined();
    expect(screen.getByText("custom_enrichment")).toBeDefined();
    expect(screen.getByText("custom_source")).toBeDefined();
    expect(screen.getByText("https://example.com/1")).toBeDefined();
    expect(screen.queryByText("Title 1")).toBeNull();
    expect(screen.queryByText("Description 1")).toBeNull();
    expect(screen.queryByText("Note 1")).toBeNull();
    expect(screen.getByText("Title 2")).toBeDefined();
    expect(screen.getByText("Description 2")).toBeDefined();
    expect(screen.getByText("Note 2")).toBeDefined();
  });

  it("render shouldAvoidSearchFilterAndScrollLoading_onLoadedState", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const reader = makeReaderDouble({
      firstPageOutcomes: [makePage([makeCapturedItem(1)], null)]
    });

    renderBrowseView({ initialAuthState: makeAuthenticatedState(), reader });
    await waitFor(() => expect(readStatus()).toBe("loaded"));

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /filter/i })).toBeNull();
    expect(addEventListener).not.toHaveBeenCalledWith("scroll", expect.any(Function), expect.anything());
  });
});

type Deferred<TValue> = {
  promise: Promise<TValue>;
  reject(error: unknown): void;
  resolve(value: TValue): void;
};

type ReaderDoubleOptions = {
  fetchAfterOutcomes?: Outcome<Page>[];
  firstPageOutcomes?: Outcome<Page>[];
};

type RenderOptions = {
  initialAuthState: AuthState;
  onUnauthorized?: () => void;
  reader: BrowseItemsReader;
};

type Outcome<TValue> = Error | Promise<TValue> | TValue;

class ReaderDouble implements BrowseItemsReader {
  fetchAfterCursors: PageCursor[] = [];
  fetchFirstPageCallCount = 0;

  constructor(
    private readonly fetchAfterOutcomes: Outcome<Page>[],
    private readonly firstPageOutcomes: Outcome<Page>[]
  ) {}

  async fetchAfter(cursor: PageCursor): Promise<Page> {
    this.fetchAfterCursors.push(cursor);
    return resolveOutcome(this.fetchAfterOutcomes.shift(), "fetchAfter");
  }

  async fetchFirstPage(): Promise<Page> {
    this.fetchFirstPageCallCount += 1;
    return resolveOutcome(this.firstPageOutcomes.shift(), "fetchFirstPage");
  }
}

function makeCapturedItem(index: number, overrides: Partial<CapturedItem> = {}): CapturedItem {
  return {
    capturedAt: new Date(Date.UTC(2026, 0, index, 10, 0, 0, 0)).toISOString(),
    capturedDescription: `Description ${index}`,
    capturedTitle: `Title ${index}`,
    enrichment: "full",
    id: makeId(index),
    kind: "link",
    note: `Note ${index}`,
    sourceType: "web_page",
    url: `https://example.com/${index}`,
    ...overrides
  };
}

function makeCursor(item: CapturedItem): PageCursor {
  return {
    capturedAt: item.capturedAt,
    id: item.id
  };
}

function makeDeferred<TValue>(): Deferred<TValue> {
  let reject: (error: unknown) => void = () => undefined;
  let resolve: (value: TValue) => void = () => undefined;
  const promise = new Promise<TValue>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function makeId(index: number): string {
  return `00000000-0000-0000-0000-${index.toString().padStart(12, "0")}`;
}

function makeAuthenticatedState(): AuthState {
  return { email: "reader@example.com", status: "authenticated" };
}

function makePage(items: CapturedItem[], nextCursor: PageCursor | null): Page {
  return {
    items: items.slice(0, PAGE_SIZE),
    nextCursor
  };
}

function makeReaderDouble(options: ReaderDoubleOptions): ReaderDouble {
  return new ReaderDouble(options.fetchAfterOutcomes ?? [], options.firstPageOutcomes ?? []);
}

function readStatus(): string | null {
  return screen.getByTestId("browse-view").getAttribute("data-status");
}

function renderBrowseView(options: RenderOptions): { authState: Writable<AuthState> } {
  const authState = writable<AuthState>(options.initialAuthState);

  render(BrowseView, {
    props: {
      authState,
      onUnauthorized: options.onUnauthorized ?? (() => undefined),
      reader: options.reader
    }
  });

  return { authState };
}

async function resolveOutcome<TValue>(outcome: Outcome<TValue> | undefined, operation: string): Promise<TValue> {
  if (outcome === undefined) {
    throw new Error(`No outcome configured for ${operation}`);
  }
  if (outcome instanceof Error) {
    throw outcome;
  }

  return outcome;
}
