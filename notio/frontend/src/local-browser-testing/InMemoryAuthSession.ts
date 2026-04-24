import type { AuthSession, AuthState } from "../auth/AuthSession";

export class InMemoryAuthSession implements AuthSession {
  private readonly subscribers = new Set<(state: AuthState) => void>();
  private state: AuthState = { status: "unauthenticated" };

  destroy(): void {}

  async signIn(email: string): Promise<void> {
    this.setState({ email, status: "authenticated" });
  }

  async signOut(): Promise<void> {
    this.setState({ status: "unauthenticated" });
  }

  subscribe(callback: (state: AuthState) => void): () => void {
    callback(this.state);
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  private setState(nextState: AuthState): void {
    this.state = nextState;
    for (const subscriber of this.subscribers) {
      subscriber(nextState);
    }
  }
}
