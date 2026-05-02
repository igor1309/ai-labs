export type CapturedItem = {
  id: string;
  kind: string;
  sourceType: string | null;
  capturedAt: string;
  url: string | null;
  note: string | null;
  enrichment: string;
  capturedTitle: string | null;
  capturedDescription: string | null;
};

export type PageCursor = {
  capturedAt: string;
  id: string;
};

export type Page = {
  items: CapturedItem[];
  nextCursor: PageCursor | null;
};

export const PAGE_SIZE = 50;

export class UnauthorizedError extends Error {}

export class ReaderError extends Error {}

export interface BrowseItemsReader {
  fetchFirstPage(): Promise<Page>;
  fetchAfter(cursor: PageCursor): Promise<Page>;
}
