import type { AuthSession, AuthState } from "../auth/AuthSession";
import type { BrowseItemsReader, Page, PageCursor } from "../browse/BrowseItemsReader";
import { ReaderError } from "../browse/BrowseItemsReader";

export type NotioRuntime = {
  authSession: AuthSession;
  reader: BrowseItemsReader;
};

export function createLocalRuntime(): NotioRuntime {
  return {
    authSession: new LocalAuthSession(),
    reader: new LocalBrowseItemsReader()
  };
}

class LocalAuthSession implements AuthSession {
  destroy(): void {}

  async signIn(): Promise<void> {}

  async signOut(): Promise<void> {}

  subscribe(callback: (state: AuthState) => void): () => void {
    callback({ status: "unauthenticated" });

    return () => undefined;
  }
}

class LocalBrowseItemsReader implements BrowseItemsReader {
  async fetchAfter(_cursor: PageCursor): Promise<Page> {
    throw new ReaderError("Local browse data is not configured");
  }

  async fetchFirstPage(): Promise<Page> {
    throw new ReaderError("Local browse data is not configured");
  }
}
