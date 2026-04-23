export type AuthState =
  | { status: "checking" }
  | { email: string; status: "authenticated" }
  | { status: "unauthenticated" };

export type AuthStateReader = {
  subscribe(callback: (state: AuthState) => void): () => void;
};
