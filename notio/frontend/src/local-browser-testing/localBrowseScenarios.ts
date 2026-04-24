import type { CapturedItem, Page, PageCursor } from "../browse/BrowseItemsReader";

export type LocalBrowseScenario = {
  firstPageErrorMessage?: string;
  firstPages: Page[];
  pagesAfter: Record<string, Page>;
};

export const localBrowseScenarios = {
  empty: {
    firstPages: [
      {
        items: [],
        nextCursor: null
      }
    ],
    pagesAfter: {}
  },
  failure: {
    firstPageErrorMessage: "Local browser testing failure",
    firstPages: [],
    pagesAfter: {}
  },
  loaded: {
    firstPages: [
      {
        items: [makeItem(1)],
        nextCursor: makeCursor(1)
      },
      {
        items: [makeItem(20, "Local browser testing refreshed item")],
        nextCursor: null
      }
    ],
    pagesAfter: {
      [toPageCursorKey(makeCursor(1))]: {
        items: [makeItem(2, "Local browser testing older item")],
        nextCursor: makeCursor(2)
      }
    }
  },
  loadMoreExhausted: {
    firstPages: [
      {
        items: [makeItem(30, "Local browser testing exhausted seed item")],
        nextCursor: makeCursor(30)
      }
    ],
    pagesAfter: {
      [toPageCursorKey(makeCursor(30))]: {
        items: [makeItem(31, "Local browser testing final older item")],
        nextCursor: null
      }
    }
  }
} satisfies Record<string, LocalBrowseScenario>;

export const defaultLocalBrowseScenario: LocalBrowseScenario = localBrowseScenarios.loaded;

export function toPageCursorKey(cursor: PageCursor): string {
  return `${cursor.capturedAt}|${cursor.id}`;
}

function makeCursor(index: number): PageCursor {
  return {
    capturedAt: makeCapturedAt(index),
    id: `local-browser-item-${index}`
  };
}

function makeItem(index: number, title = `Local browser testing item ${index}`): CapturedItem {
  return {
    capturedAt: makeCapturedAt(index),
    capturedDescription: `Deterministic local browser testing item ${index}.`,
    capturedTitle: title,
    enrichment: "full",
    id: `local-browser-item-${index}`,
    kind: "link",
    note: `Local note ${index}`,
    sourceType: "web_page",
    url: `https://example.com/local-browser-testing/${index}`
  };
}

function makeCapturedAt(index: number): string {
  return new Date(Date.UTC(2026, 3, 24, 12, 0, 0, 0) - index * 60_000).toISOString();
}
