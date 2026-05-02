export type AuthState =
  | { status: "checking" }
  | { email: string; status: "authenticated" }
  | { status: "unauthenticated" };

export class SignInError extends Error {}

export class SignOutError extends Error {}

export interface AuthSession {
  subscribe(callback: (state: AuthState) => void): () => void;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  destroy(): void;
}

export type AuthStateReader = Pick<AuthSession, "subscribe">;
