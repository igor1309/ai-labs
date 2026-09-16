import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface WorkspaceRepositories {
  remember(workspace: string, repository: string): void;
  recall(workspace: string): string | undefined;
  close(): void;
}

export function openWorkspaceRepositories(file: string): WorkspaceRepositories {
  mkdirSync(dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(
    "CREATE TABLE IF NOT EXISTS workspace_repositories (workspace TEXT PRIMARY KEY, repository TEXT NOT NULL)",
  );
  const insert = database.prepare(
    "INSERT INTO workspace_repositories (workspace, repository) VALUES (?, ?) " +
      "ON CONFLICT (workspace) DO UPDATE SET repository = excluded.repository",
  );
  const select = database.prepare(
    "SELECT repository FROM workspace_repositories WHERE workspace = ?",
  );

  return {
    remember(workspace, repository) {
      insert.run(workspace, repository);
    },
    recall(workspace) {
      const row = select.get(workspace);

      return row === undefined ? undefined : String(row.repository);
    },
    close() {
      database.close();
    },
  };
}
