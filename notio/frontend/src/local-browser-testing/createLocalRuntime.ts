import type { AuthSession } from "../auth/AuthSession";
import type { BrowseItemsReader } from "../browse/BrowseItemsReader";
import { InMemoryAuthSession } from "./InMemoryAuthSession";
import { InMemoryBrowseItemsReader } from "./InMemoryBrowseItemsReader";
import { defaultLocalBrowseScenario, localBrowseScenarios, type LocalBrowseScenario } from "./localBrowseScenarios";

type LocalBrowseScenarioName = keyof typeof localBrowseScenarios;

export type NotioRuntime = {
  authSession: AuthSession;
  reader: BrowseItemsReader;
};

export function createLocalRuntime(): NotioRuntime {
  return {
    authSession: new InMemoryAuthSession(),
    reader: new InMemoryBrowseItemsReader(readLocalBrowseScenario())
  };
}

function readLocalBrowseScenario(): LocalBrowseScenario {
  const name: unknown = import.meta.env.VITE_NOTIO_LOCAL_BROWSE_SCENARIO;
  if (isLocalBrowseScenarioName(name)) {
    return localBrowseScenarios[name];
  }

  return defaultLocalBrowseScenario;
}

function isLocalBrowseScenarioName(value: unknown): value is LocalBrowseScenarioName {
  return value === "empty" || value === "failure" || value === "loaded" || value === "loadMoreExhausted";
}
