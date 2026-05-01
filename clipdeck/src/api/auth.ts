export interface Env {
  ASSETS?: Fetcher;
  GITHUB_TOKEN: string;
  SHARED_SECRET: string;
}

export function isAuthorized(request: Request, env: Env): boolean {
  return request.headers.get("Authorization") === `Bearer ${env.SHARED_SECRET}`;
}
