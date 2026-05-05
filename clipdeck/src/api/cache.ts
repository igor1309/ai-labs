export const FRESHNESS_TTL_SECONDS = 10;

export const POINTER_URL = "https://clipdeck.cache.internal/api/items/current";

const BODY_PREFIX = "https://clipdeck.cache.internal/api/items/sha/";

export function bodyCacheKey(sha: string): string {
  return `${BODY_PREFIX}${encodeURIComponent(sha)}`;
}

export interface ItemCachePointer {
  freshAtMs: number;
  sha: string;
}

export interface ItemCache {
  readBody(sha: string): Promise<string | undefined>;
  readPointer(): Promise<ItemCachePointer | undefined>;
  writeBody(sha: string, body: string): Promise<void>;
  writePointer(sha: string): Promise<void>;
}

export function createItemCache(now: () => number = Date.now): ItemCache {
  return {
    async readBody(sha: string): Promise<string | undefined> {
      const cached = await caches.default.match(bodyCacheKey(sha));
      if (cached === undefined) {
        return undefined;
      }
      return await cached.text();
    },
    async readPointer(): Promise<ItemCachePointer | undefined> {
      const cached = await caches.default.match(POINTER_URL);
      if (cached === undefined) {
        return undefined;
      }
      const text = await cached.text();
      try {
        const parsed = JSON.parse(text) as Partial<ItemCachePointer>;
        if (typeof parsed.sha !== "string" || parsed.sha === "" || typeof parsed.freshAtMs !== "number") {
          return undefined;
        }
        return { freshAtMs: parsed.freshAtMs, sha: parsed.sha };
      } catch {
        return undefined;
      }
    },
    async writeBody(sha: string, body: string): Promise<void> {
      await caches.default.put(bodyCacheKey(sha), new Response(body, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": "application/json"
        }
      }));
    },
    async writePointer(sha: string): Promise<void> {
      const payload: ItemCachePointer = { freshAtMs: now(), sha };
      await caches.default.put(POINTER_URL, new Response(JSON.stringify(payload), {
        headers: {
          "Cache-Control": "public, max-age=31536000",
          "Content-Type": "application/json"
        }
      }));
    }
  };
}

export function isPointerFresh(pointer: ItemCachePointer, nowMs: number): boolean {
  return nowMs - pointer.freshAtMs < FRESHNESS_TTL_SECONDS * 1000;
}
