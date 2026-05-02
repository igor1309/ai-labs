import type { BrowseItemsReader, Page, PageCursor } from "../browse/BrowseItemsReader";
import { ReaderError } from "../browse/BrowseItemsReader";
import { defaultLocalBrowseScenario, toPageCursorKey, type LocalBrowseScenario } from "./localBrowseScenarios";

export class InMemoryBrowseItemsReader implements BrowseItemsReader {
  private firstPageRequestCount = 0;

  constructor(private readonly scenario: LocalBrowseScenario = defaultLocalBrowseScenario) {}

  async fetchAfter(cursor: PageCursor): Promise<Page> {
    return this.scenario.pagesAfter[toPageCursorKey(cursor)] ?? emptyPage();
  }

  async fetchFirstPage(): Promise<Page> {
    if (this.scenario.firstPageErrorMessage !== undefined) {
      throw new ReaderError(this.scenario.firstPageErrorMessage);
    }

    const page = this.scenario.firstPages[Math.min(this.firstPageRequestCount, this.scenario.firstPages.length - 1)] ?? emptyPage();
    this.firstPageRequestCount += 1;

    return page;
  }
}

function emptyPage(): Page {
  return {
    items: [],
    nextCursor: null
  };
}
