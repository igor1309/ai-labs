import type { AuthSession } from "../auth/AuthSession";
import type { BrowseItemsReader, Page, PageCursor } from "../browse/BrowseItemsReader";
import { ReaderError } from "../browse/BrowseItemsReader";
import { InMemoryAuthSession } from "./InMemoryAuthSession";

export type NotioRuntime = {
  authSession: AuthSession;
  reader: BrowseItemsReader;
};

export function createLocalRuntime(): NotioRuntime {
  return {
    authSession: new InMemoryAuthSession(),
    reader: new LocalBrowseItemsReader()
  };
}

class LocalBrowseItemsReader implements BrowseItemsReader {
  async fetchAfter(_cursor: PageCursor): Promise<Page> {
    throw new ReaderError("Local browse data is not configured");
  }

  async fetchFirstPage(): Promise<Page> {
    throw new ReaderError("Local browse data is not configured");
  }
}
