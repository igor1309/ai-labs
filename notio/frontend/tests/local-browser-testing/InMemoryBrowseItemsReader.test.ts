import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ReaderError } from "../../src/browse/BrowseItemsReader";
import { InMemoryBrowseItemsReader } from "../../src/local-browser-testing/InMemoryBrowseItemsReader";
import { localBrowseScenarios } from "../../src/local-browser-testing/localBrowseScenarios";

describe("InMemoryBrowseItemsReader", () => {
  it("file shouldExist_onLocalBrowserTestingBrowseAdapter", () => {
    expect(existsSync("src/local-browser-testing/InMemoryBrowseItemsReader.ts")).toBe(true);
  });

  it("fetchFirstPage shouldReturnLoadedPage_onLoadedScenario", async () => {
    const sut = new InMemoryBrowseItemsReader(localBrowseScenarios.loaded);

    const page = await sut.fetchFirstPage();

    expect(page.items.map(($0) => $0.capturedTitle)).toEqual(["Local browser testing item 1"]);
  });

  it("fetchFirstPage shouldReturnRefreshPage_onSecondFirstPageRequest", async () => {
    const sut = new InMemoryBrowseItemsReader(localBrowseScenarios.loaded);

    await sut.fetchFirstPage();
    const page = await sut.fetchFirstPage();

    expect(page.items.map(($0) => $0.capturedTitle)).toEqual(["Local browser testing refreshed item"]);
  });

  it("fetchAfter shouldReturnOlderPage_onLoadedScenarioCursor", async () => {
    const sut = new InMemoryBrowseItemsReader(localBrowseScenarios.loaded);
    const firstPage = await sut.fetchFirstPage();

    const page = await sut.fetchAfter(firstPage.nextCursor!);

    expect(page.items.map(($0) => $0.capturedTitle)).toEqual(["Local browser testing older item"]);
  });

  it("fetchAfter shouldReturnNullCursor_onLoadMoreExhaustedScenario", async () => {
    const sut = new InMemoryBrowseItemsReader(localBrowseScenarios.loadMoreExhausted);
    const firstPage = await sut.fetchFirstPage();

    const page = await sut.fetchAfter(firstPage.nextCursor!);

    expect(page.nextCursor).toBeNull();
  });

  it("fetchFirstPage shouldReturnEmptyPage_onEmptyScenario", async () => {
    const sut = new InMemoryBrowseItemsReader(localBrowseScenarios.empty);

    const page = await sut.fetchFirstPage();

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("fetchFirstPage shouldThrowReaderError_onFailureScenario", async () => {
    const sut = new InMemoryBrowseItemsReader(localBrowseScenarios.failure);

    await expect(sut.fetchFirstPage()).rejects.toBeInstanceOf(ReaderError);
  });
});
