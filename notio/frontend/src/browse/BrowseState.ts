import type { CapturedItem } from "./BrowseItemsReader";

export const BROWSE_STATUS_VALUES = ["loading", "refreshing", "loaded", "empty", "failed", "unauthorized"] as const;

export type BrowseStatus = (typeof BROWSE_STATUS_VALUES)[number];

export type BrowseState =
  | { status: "loading" }
  | { hasMore: boolean; items: CapturedItem[]; loadMoreError: string | null; status: "loaded" }
  | { status: "empty" }
  | { message: string; status: "failed" }
  | { status: "unauthorized" }
  | { items: CapturedItem[]; status: "refreshing" };
