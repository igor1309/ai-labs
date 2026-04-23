import { describe, expect, it } from "vitest";

import { PAGE_SIZE, ReaderError, UnauthorizedError } from "../../src/browse/BrowseItemsReader";
import { SupabaseBrowseItemsReader } from "../../src/browse/SupabaseBrowseItemsReader";

const CAPTURED_ITEMS_SELECT = "id, kind, source_type, captured_at, url, note, enrichment, captured_title, captured_description";

describe("SupabaseBrowseItemsReader", () => {
  it("fetchFirstPage shouldReturnAtMostPageSize_onLargeResponse", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(60, 51))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items).toHaveLength(PAGE_SIZE);
  });

  it("fetchFirstPage shouldOrderByCapturedAtDesc_onQuery", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 1))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchFirstPage();

    expect(queryCalls[0]?.orders[0]).toEqual({ ascending: false, column: "captured_at" });
  });

  it("fetchFirstPage shouldSetLimitToPageSize_onQuery", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 1))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchFirstPage();

    expect(queryCalls[0]?.limitValue).toBe(PAGE_SIZE);
  });

  it("fetchFirstPage shouldBreakTiesByIdDesc_onQuery", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 1))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchFirstPage();

    expect(queryCalls[0]?.orders[1]).toEqual({ ascending: false, column: "id" });
  });

  it("fetchAfter shouldApplyStrictOlderThanCursorFilter_onCursor", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(2, 1))]
    });
    const cursor = {
      capturedAt: "2026-04-23T09:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000100"
    };
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchAfter(cursor);

    expect(queryCalls[0]?.orFilters[0]).toBe(expectedOlderThanFilter(cursor));
  });

  it("fetchAfter shouldReturnEmptyItemsAndNullCursor_onNoOlderRows", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchAfter({
      capturedAt: "2026-04-23T09:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001"
    });

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("fetchFirstPage shouldReturnNullNextCursor_onShortPage", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 2))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.nextCursor).toBeNull();
  });

  it("fetchFirstPage shouldReturnLastItemAsNextCursor_onExactPageSize", async () => {
    const rows = makeDescendingRows(100, PAGE_SIZE);
    const { client } = makeClient({
      queryOutcomes: [successfulResponse(rows)]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.nextCursor).toEqual({
      capturedAt: rows.at(-1)?.captured_at,
      id: rows.at(-1)?.id
    });
  });

  it("fetchAfter shouldReturnContiguousNextPage_onChainedCursor", async () => {
    const firstRows = makeDescendingRows(100, PAGE_SIZE);
    const secondRows = makeDescendingRows(50, PAGE_SIZE);
    const { client } = makeClient({
      queryOutcomes: [successfulResponse(firstRows), successfulResponse(secondRows)]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const firstPage = await sut.fetchFirstPage();
    const secondPage = await sut.fetchAfter(firstPage.nextCursor!);

    expect([...firstPage.items, ...secondPage.items].map(($0) => $0.id)).toEqual([
      ...firstRows.map(($0) => $0.id),
      ...secondRows.map(($0) => $0.id)
    ]);
  });

  it("fetchFirstPage shouldReturnUnknownKindVerbatim_onUnknownKindRow", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([makeRow(1, { kind: "custom_kind" })])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]?.kind).toBe("custom_kind");
  });

  it("fetchFirstPage shouldReturnUnknownSourceTypeVerbatim_onUnknownSourceTypeRow", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([makeRow(1, { source_type: "custom_source" })])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]?.sourceType).toBe("custom_source");
  });

  it("fetchFirstPage shouldReturnUnknownEnrichmentVerbatim_onUnknownEnrichmentRow", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([makeRow(1, { enrichment: "custom_enrichment" })])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]?.enrichment).toBe("custom_enrichment");
  });

  it("fetchFirstPage shouldReturnNullSourceType_onNoteRow", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([makeRow(1, { kind: "note", source_type: null })])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]?.sourceType).toBeNull();
  });

  it("fetchFirstPage shouldReturnNullUrl_onNoteRow", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([makeRow(1, { kind: "note", source_type: null, url: null })])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]?.url).toBeNull();
  });

  it("fetchFirstPage shouldReturnNullableTitleAndDescription_onAnyRow", async () => {
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([makeRow(1, { captured_description: null, captured_title: null })])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]).toMatchObject({
      capturedDescription: null,
      capturedTitle: null
    });
  });

  it("fetchFirstPage shouldReturnIsoCapturedAtString_onValidRow", async () => {
    const row = makeRow(1);
    const { client } = makeClient({
      queryOutcomes: [successfulResponse([row])]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    const page = await sut.fetchFirstPage();

    expect(page.items[0]?.capturedAt).toBe(row.captured_at);
  });

  it("fetchFirstPage shouldThrowUnauthorizedError_onMissingSession", async () => {
    const { client } = makeClient({
      sessionOutcome: { error: null, session: null }
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(sut.fetchFirstPage()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fetchFirstPage shouldThrowUnauthorizedError_onUnauthorizedResponse", async () => {
    const { client } = makeClient({
      queryOutcomes: [
        {
          data: null,
          error: { message: "unauthorized" },
          status: 401
        }
      ]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(sut.fetchFirstPage()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fetchFirstPage shouldThrowReaderError_onServerError", async () => {
    const { client } = makeClient({
      queryOutcomes: [
        {
          data: null,
          error: { message: "server failure" },
          status: 500
        }
      ]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(sut.fetchFirstPage()).rejects.toBeInstanceOf(ReaderError);
  });

  it("fetchFirstPage shouldThrowReaderError_onNetworkFailure", async () => {
    const { client } = makeClient({
      queryOutcomes: [new Error("network failure")]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(sut.fetchFirstPage()).rejects.toBeInstanceOf(ReaderError);
  });

  it("fetchFirstPage shouldThrowReaderError_onSchemaMismatch", async () => {
    const { client } = makeClient({
      queryOutcomes: [
        successfulResponse([
          {
            captured_at: "not-an-iso-date",
            captured_description: null,
            captured_title: null,
            enrichment: "full",
            id: "00000000-0000-0000-0000-000000000001",
            kind: "note",
            note: null,
            source_type: null,
            url: null
          }
        ])
      ]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(sut.fetchFirstPage()).rejects.toBeInstanceOf(ReaderError);
  });

  it("fetchAfter shouldThrowUnauthorizedError_onUnauthorizedResponse", async () => {
    const { client } = makeClient({
      queryOutcomes: [
        {
          data: null,
          error: { message: "unauthorized" },
          status: 401
        }
      ]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(
      sut.fetchAfter({
        capturedAt: "2026-04-23T09:00:00.000Z",
        id: "00000000-0000-0000-0000-000000000001"
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fetchAfter shouldThrowReaderError_onNetworkFailure", async () => {
    const { client } = makeClient({
      queryOutcomes: [new Error("network failure")]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await expect(
      sut.fetchAfter({
        capturedAt: "2026-04-23T09:00:00.000Z",
        id: "00000000-0000-0000-0000-000000000001"
      })
    ).rejects.toBeInstanceOf(ReaderError);
  });

  it("fetchFirstPage shouldSelectTheExactColumnList_onQuery", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 1))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchFirstPage();

    expect(queryCalls[0]?.selectedColumns).toBe(CAPTURED_ITEMS_SELECT);
  });

  it("fetchFirstPage shouldAvoidSelectStar_onQuery", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 1))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchFirstPage();

    expect(queryCalls[0]?.selectedColumns?.includes("*")).toBe(false);
  });

  it("fetchFirstPage shouldNeverCallMutationMethods_onReaderQuery", async () => {
    const { client, queryCalls } = makeClient({
      queryOutcomes: [successfulResponse(makeDescendingRows(3, 1))]
    });
    const sut = new SupabaseBrowseItemsReader(client as never);

    await sut.fetchFirstPage();

    expect(queryCalls[0]?.mutationCalls).toEqual([]);
  });
});

type ClientOptions = {
  queryOutcomes?: QueryOutcome[];
  sessionOutcome?: SessionOutcome;
};

type QueryCall = {
  limitValue: number | null;
  mutationCalls: string[];
  orFilters: string[];
  orders: Array<{ ascending: boolean; column: string }>;
  selectedColumns: string | null;
  table: string;
};

type QueryOutcome = QueryResponse | Error;

type QueryResponse = {
  data: unknown[] | null;
  error: unknown;
  status: number;
};

type SessionOutcome = {
  error: unknown;
  session: object | null;
};

class QueryBuilderDouble implements PromiseLike<QueryResponse> {
  constructor(
    private readonly call: QueryCall,
    private readonly outcome: QueryOutcome
  ) {}

  delete(): QueryBuilderDouble {
    this.call.mutationCalls.push("delete");
    return this;
  }

  insert(): QueryBuilderDouble {
    this.call.mutationCalls.push("insert");
    return this;
  }

  limit(value: number): QueryBuilderDouble {
    this.call.limitValue = value;
    return this;
  }

  or(filter: string): QueryBuilderDouble {
    this.call.orFilters.push(filter);
    return this;
  }

  order(column: string, options: { ascending: boolean }): QueryBuilderDouble {
    this.call.orders.push({ ascending: options.ascending, column });
    return this;
  }

  rpc(): QueryBuilderDouble {
    this.call.mutationCalls.push("rpc");
    return this;
  }

  select(columns: string): QueryBuilderDouble {
    this.call.selectedColumns = columns;
    return this;
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (this.outcome instanceof Error) {
      return Promise.reject(this.outcome).then(onfulfilled, onrejected);
    }

    return Promise.resolve(this.outcome).then(onfulfilled, onrejected);
  }

  update(): QueryBuilderDouble {
    this.call.mutationCalls.push("update");
    return this;
  }

  upsert(): QueryBuilderDouble {
    this.call.mutationCalls.push("upsert");
    return this;
  }
}

function expectedOlderThanFilter(cursor: { capturedAt: string; id: string }): string {
  const encodedCapturedAt = encodeURIComponent(cursor.capturedAt);
  const encodedId = encodeURIComponent(cursor.id);

  return `captured_at.lt.${encodedCapturedAt},and(captured_at.eq.${encodedCapturedAt},id.lt.${encodedId})`;
}

function makeClient(options: ClientOptions) {
  const queryOutcomes = [...(options.queryOutcomes ?? [successfulResponse(makeDescendingRows(1, 1))])];
  const queryCalls: QueryCall[] = [];
  const sessionOutcome = options.sessionOutcome ?? { error: null, session: {} };

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: sessionOutcome.session },
        error: sessionOutcome.error
      })
    },
    from: (table: string) => {
      const outcome = queryOutcomes.shift();
      if (outcome === undefined) {
        throw new Error("No query outcome configured");
      }

      const call: QueryCall = {
        limitValue: null,
        mutationCalls: [],
        orFilters: [],
        orders: [],
        selectedColumns: null,
        table
      };
      queryCalls.push(call);

      return new QueryBuilderDouble(call, outcome);
    }
  };

  return { client, queryCalls };
}

function makeDescendingRows(start: number, count: number): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = start; index > start - count; index -= 1) {
    rows.push(makeRow(index));
  }

  return rows;
}

function makeRow(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = index.toString().padStart(12, "0");

  return {
    captured_at: new Date(Date.UTC(2026, 3, 23, 9, 0, index)).toISOString(),
    captured_description: `Description ${index}`,
    captured_title: `Title ${index}`,
    enrichment: "full",
    id: `00000000-0000-0000-0000-${suffix}`,
    kind: "link",
    note: null,
    source_type: "web_page",
    url: `https://example.com/${index}`,
    ...overrides
  };
}

function successfulResponse(data: unknown[]): QueryResponse {
  return {
    data,
    error: null,
    status: 200
  };
}
