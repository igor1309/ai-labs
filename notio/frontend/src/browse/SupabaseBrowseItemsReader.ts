import type { SupabaseClient } from "@supabase/supabase-js";

import type { BrowseItemsReader, CapturedItem, Page, PageCursor } from "./BrowseItemsReader";
import { PAGE_SIZE, ReaderError, UnauthorizedError } from "./BrowseItemsReader";

type CapturedItemRow = {
  id: unknown;
  kind: unknown;
  source_type: unknown;
  captured_at: unknown;
  url: unknown;
  note: unknown;
  enrichment: unknown;
  captured_title: unknown;
  captured_description: unknown;
};

type QueryResponse = {
  data: unknown[] | null;
  error: unknown;
  status: number;
};

const CAPTURED_ITEMS_SELECT = "id, kind, source_type, captured_at, url, note, enrichment, captured_title, captured_description";

export class SupabaseBrowseItemsReader implements BrowseItemsReader {
  constructor(private readonly client: SupabaseClient) {}

  async fetchFirstPage(): Promise<Page> {
    return this.fetchPage();
  }

  async fetchAfter(cursor: PageCursor): Promise<Page> {
    return this.fetchPage(cursor);
  }

  private async fetchPage(cursor?: PageCursor): Promise<Page> {
    try {
      await this.ensureSession();
      const response = await this.executeQuery(cursor);

      if (response.error !== null) {
        throw toMappedError(response.error, response.status);
      }
      if (response.status === 401) {
        throw new UnauthorizedError("Unauthorized");
      }
      if (response.status >= 500) {
        throw new ReaderError("Failed to read captured items");
      }

      const rows = response.data ?? [];
      const items = rows.slice(0, PAGE_SIZE).map((row) => toCapturedItem(row));

      return {
        items,
        nextCursor: toNextCursor(items)
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError || error instanceof ReaderError) {
        throw error;
      }
      if (isUnauthorizedStatus(error)) {
        throw new UnauthorizedError("Unauthorized");
      }

      throw new ReaderError("Failed to read captured items");
    }
  }

  private async ensureSession(): Promise<void> {
    const result = await this.client.auth.getSession();
    if (result.error !== null) {
      if (isUnauthorizedStatus(result.error)) {
        throw new UnauthorizedError("Unauthorized");
      }

      throw new ReaderError("Failed to read Supabase session");
    }
    if (result.data.session === null) {
      throw new UnauthorizedError("Unauthorized");
    }
  }

  private async executeQuery(cursor?: PageCursor): Promise<QueryResponse> {
    let query: any = this.client
      .from("captured_items")
      .select(CAPTURED_ITEMS_SELECT)
      .order("captured_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor !== undefined) {
      query = query.or(toOlderThanFilter(cursor));
    }

    return query as Promise<QueryResponse>;
  }
}

function toCapturedItem(value: unknown): CapturedItem {
  const row = value as Partial<CapturedItemRow>;

  return {
    capturedAt: readRequiredIsoString(row.captured_at, "captured_at"),
    capturedDescription: readNullableString(row.captured_description, "captured_description"),
    capturedTitle: readNullableString(row.captured_title, "captured_title"),
    enrichment: readRequiredString(row.enrichment, "enrichment"),
    id: readRequiredString(row.id, "id"),
    kind: readRequiredString(row.kind, "kind"),
    note: readNullableString(row.note, "note"),
    sourceType: readNullableString(row.source_type, "source_type"),
    url: readNullableString(row.url, "url")
  };
}

function toMappedError(error: unknown, status: number): Error {
  if (status === 401 || isUnauthorizedStatus(error)) {
    return new UnauthorizedError("Unauthorized");
  }

  return new ReaderError("Failed to read captured items");
}

function toNextCursor(items: CapturedItem[]): PageCursor | null {
  if (items.length < PAGE_SIZE) {
    return null;
  }

  const lastItem = items.at(-1);
  if (lastItem === undefined) {
    throw new ReaderError("Invalid page shape");
  }

  return {
    capturedAt: lastItem.capturedAt,
    id: lastItem.id
  };
}

function toOlderThanFilter(cursor: PageCursor): string {
  return `captured_at.lt.${cursor.capturedAt},and(captured_at.eq.${cursor.capturedAt},id.lt.${cursor.id})`;
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ReaderError(`Invalid ${fieldName} type`);
  }

  return value;
}

function readRequiredIsoString(value: unknown, fieldName: string): string {
  const text = readRequiredString(value, fieldName);
  if (Number.isNaN(Date.parse(text))) {
    throw new ReaderError(`Invalid ${fieldName} value`);
  }

  return text;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ReaderError(`Invalid ${fieldName} type`);
  }

  return value;
}

function isUnauthorizedStatus(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { status?: unknown; statusCode?: unknown };
  return candidate.status === 401 || candidate.statusCode === 401;
}
