import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthSession, AuthState } from "./AuthSession";
import { SignInError, SignOutError } from "./AuthSession";

export class SupabaseAuthSession implements AuthSession {
  private bootstrapPending = true;
  private destroyed = false;
  private readonly subscription: { unsubscribe(): void };
  private readonly subscribers = new Set<(state: AuthState) => void>();
  private state: AuthState = { status: "checking" };

  constructor(private readonly client: SupabaseClient) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      this.handleAuthStateChange(event, session);
    });
    this.subscription = data.subscription;
    void this.bootstrap();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.subscription.unsubscribe();
    this.subscribers.clear();
  }

  async signIn(email: string): Promise<void> {
    const result = await this.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: globalThis.location.origin
      }
    });
    if (result.error !== null) {
      throw new SignInError("Failed to send magic-link sign-in email");
    }
  }

  async signOut(): Promise<void> {
    const result = await this.client.auth.signOut();
    if (result.error !== null) {
      throw new SignOutError("Failed to sign out");
    }

    this.setState({ status: "unauthenticated" });
  }

  subscribe(callback: (state: AuthState) => void): () => void {
    callback(this.state);
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  private async bootstrap(): Promise<void> {
    try {
      const result = await this.client.auth.getSession();
      if (this.destroyed) {
        return;
      }

      this.bootstrapPending = false;
      if (this.state.status !== "checking") {
        return;
      }
      if (result.error !== null) {
        this.setState({ status: "unauthenticated" });
        return;
      }

      this.setState(toAuthState(result.data.session));
    } catch {
      if (this.destroyed) {
        return;
      }

      this.bootstrapPending = false;
      if (this.state.status === "checking") {
        this.setState({ status: "unauthenticated" });
      }
      return;
    }
  }

  private handleAuthStateChange(event: string, session: unknown): void {
    if (this.destroyed) {
      return;
    }
    if (this.bootstrapPending) {
      return;
    }
    if (event === "SIGNED_OUT") {
      this.setState({ status: "unauthenticated" });
      return;
    }
    if (event === "TOKEN_REFRESHED" && session === null) {
      this.setState({ status: "unauthenticated" });
      return;
    }

    this.setState(toAuthState(session));
  }

  private setState(nextState: AuthState): void {
    if (areEqualAuthStates(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    for (const subscriber of this.subscribers) {
      subscriber(nextState);
    }
  }
}

function areEqualAuthStates(left: AuthState, right: AuthState): boolean {
  if (left.status !== right.status) {
    return false;
  }
  if (left.status !== "authenticated") {
    return true;
  }

  return right.status === "authenticated" && left.email === right.email;
}

function toAuthState(session: unknown): AuthState {
  const email = readSessionEmail(session);
  if (email === null) {
    return { status: "unauthenticated" };
  }

  return {
    email,
    status: "authenticated"
  };
}

function readSessionEmail(session: unknown): string | null {
  if (typeof session !== "object" || session === null) {
    return null;
  }

  const maybeUser = (session as { user?: unknown }).user;
  if (typeof maybeUser !== "object" || maybeUser === null) {
    return null;
  }

  const maybeEmail = (maybeUser as { email?: unknown }).email;
  if (typeof maybeEmail !== "string" || maybeEmail.length === 0) {
    return null;
  }

  return maybeEmail;
}
