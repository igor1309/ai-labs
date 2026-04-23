import { describe, expect, it, vi } from "vitest";

import type { AuthState } from "../../src/auth/AuthSession";
import { SignInError, SignOutError } from "../../src/auth/AuthSession";
import { SupabaseAuthSession } from "../../src/auth/SupabaseAuthSession";

describe("SupabaseAuthSession", () => {
  it("subscribe shouldStartInCheckingState_onBootstrapPending", () => {
    const sessionRequest = makeDeferred<SessionResult>();
    const client = makeClientDouble({
      sessionOutcome: sessionRequest.promise
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });

    expect(receivedStates[0]).toEqual({ status: "checking" });
  });

  it("bootstrap shouldStayCheckingUntilGetSessionResolves_onInitialSessionEventDuringPendingBootstrap", async () => {
    const sessionRequest = makeDeferred<SessionResult>();
    const client = makeClientDouble({
      sessionOutcome: sessionRequest.promise
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(client.initialSessionEmitCount).toBe(1);
    });

    expect(receivedStates.at(-1)).toEqual({ status: "checking" });
    sessionRequest.resolve({ data: { session: null }, error: null });

    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });
  });

  it("subscribe shouldTransitionToUnauthenticated_onMissingPersistedSession", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: null }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });

    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });
  });

  it("subscribe shouldTransitionToAuthenticated_onPersistedSession", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: makeSession("persisted@example.com") }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });

    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ email: "persisted@example.com", status: "authenticated" });
    });
  });

  it("subscribe shouldExposeAuthenticatedEmail_onPersistedSession", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: makeSession("reader@example.com") }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });

    await vi.waitFor(() => {
      const state = receivedStates.at(-1);
      expect(state).toEqual({ email: "reader@example.com", status: "authenticated" });
    });
  });

  it("signIn shouldCallSignInWithOtp_onGivenEmail", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);

    await sut.signIn("magic@example.com");

    expect(client.signInWithOtpCalls.map(($0) => $0.email)).toEqual(["magic@example.com"]);
  });

  it("signIn shouldUseCurrentOriginForEmailRedirect_onMagicLinkRequest", async () => {
    vi.stubGlobal("location", { origin: "https://notio.enoa.ai" });
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);

    await sut.signIn("redirect@example.com");

    expect(client.signInWithOtpCalls.map(($0) => $0.options?.emailRedirectTo)).toEqual(["https://notio.enoa.ai"]);
  });

  it("signIn shouldResolveWithoutStateTransition_onSuccessfulRequest", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });
    const stateCountBeforeSignIn = receivedStates.length;

    await sut.signIn("state@example.com");

    expect(receivedStates).toHaveLength(stateCountBeforeSignIn);
  });

  it("signIn shouldThrowSignInError_onSupabaseFailure", async () => {
    const client = makeClientDouble({
      signInError: new Error("otp failed")
    });
    const sut = new SupabaseAuthSession(client.value as never);

    await expect(sut.signIn("broken@example.com")).rejects.toBeInstanceOf(SignInError);
  });

  it("subscribe shouldTransitionToAuthenticated_onSignedInAuthEvent", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });

    client.emit("SIGNED_IN", makeSession("event@example.com"));

    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ email: "event@example.com", status: "authenticated" });
    });
  });

  it("signOut shouldTransitionToUnauthenticated_onSuccessfulCall", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: makeSession("signed@example.com") }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ email: "signed@example.com", status: "authenticated" });
    });

    await sut.signOut();

    expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
  });

  it("signOut shouldThrowSignOutError_onSupabaseFailure", async () => {
    const client = makeClientDouble({
      signOutError: new Error("sign out failed")
    });
    const sut = new SupabaseAuthSession(client.value as never);

    await expect(sut.signOut()).rejects.toBeInstanceOf(SignOutError);
  });

  it("subscribe shouldTransitionToUnauthenticated_onTokenRefreshFailure", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: makeSession("refresh@example.com") }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ email: "refresh@example.com", status: "authenticated" });
    });

    client.emit("TOKEN_REFRESHED", null);

    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });
  });

  it("subscribe shouldSendCurrentStateImmediately_onNewSubscription", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    const unsubscribe = sut.subscribe(($0) => {
      receivedStates.push($0);
    });

    expect(receivedStates[0]).toEqual({ status: "checking" });

    unsubscribe();
  });

  it("subscribe shouldSendSubsequentStateChanges_onAuthTransitions", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });

    client.emit("SIGNED_IN", makeSession("next@example.com"));

    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ email: "next@example.com", status: "authenticated" });
    });
  });

  it("subscribe shouldSendCurrentStateIndependently_onSecondSubscriber", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: makeSession("second@example.com") }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);
    const firstSubscriberStates: AuthState[] = [];
    const secondSubscriberStates: AuthState[] = [];

    sut.subscribe(($0) => {
      firstSubscriberStates.push($0);
    });
    await vi.waitFor(() => {
      expect(firstSubscriberStates.at(-1)).toEqual({ email: "second@example.com", status: "authenticated" });
    });

    sut.subscribe(($0) => {
      secondSubscriberStates.push($0);
    });

    expect(secondSubscriberStates[0]).toEqual({ email: "second@example.com", status: "authenticated" });
  });

  it("subscribe shouldStopNotifications_onUnsubscribe", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    const unsubscribe = sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });
    unsubscribe();
    const stateCountAfterUnsubscribe = receivedStates.length;

    client.emit("SIGNED_IN", makeSession("ignored@example.com"));

    expect(receivedStates).toHaveLength(stateCountAfterUnsubscribe);
  });

  it("destroy shouldUnsubscribeFromAuthStateChanges_onDestroyCall", () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);

    sut.destroy();

    expect(client.authListenerUnsubscribeCallCount).toBe(1);
  });

  it("destroy shouldStopStateEmissions_onSubsequentAuthEvents", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await vi.waitFor(() => {
      expect(receivedStates.at(-1)).toEqual({ status: "unauthenticated" });
    });
    sut.destroy();
    const stateCountAfterDestroy = receivedStates.length;

    client.emit("SIGNED_IN", makeSession("destroyed@example.com"));

    expect(receivedStates).toHaveLength(stateCountAfterDestroy);
  });

  it("sessionFlow shouldAvoidAnonymousSignInCall_onSupportedOperations", async () => {
    const client = makeClientDouble({
      sessionOutcome: { data: { session: makeSession("forbidden@example.com") }, error: null }
    });
    const sut = new SupabaseAuthSession(client.value as never);

    await sut.signIn("forbidden@example.com");
    await sut.signOut();

    expect(client.signInAnonymouslyCallCount).toBe(0);
  });

  it("sessionFlow shouldAvoidSignUpCall_onSupportedOperations", async () => {
    const client = makeClientDouble({});
    const sut = new SupabaseAuthSession(client.value as never);

    await sut.signIn("signup@example.com");
    await expect(sut.signOut()).resolves.toBeUndefined();

    expect(client.signUpCallCount).toBe(0);
  });
});

type AuthChangeEvent = "INITIAL_SESSION" | "PASSWORD_RECOVERY" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";

type ClientDoubleOptions = {
  emitInitialSessionEvent?: boolean;
  initialSessionEventSession?: SessionValue;
  sessionOutcome?: Outcome<SessionResult>;
  signInError?: unknown;
  signOutError?: unknown;
};

type Deferred<TValue> = {
  promise: Promise<TValue>;
  reject(error: unknown): void;
  resolve(value: TValue): void;
};

type Outcome<TValue> = Promise<TValue> | TValue;

type SessionResult = {
  data: {
    session: SessionValue;
  };
  error: unknown;
};

type SessionValue = {
  user: {
    email: string | null;
  };
} | null;

type SupabaseAuthClientDouble = {
  auth: {
    getSession(): Promise<SessionResult>;
    onAuthStateChange(callback: (event: AuthChangeEvent, session: SessionValue) => void): {
      data: {
        subscription: {
          unsubscribe(): void;
        };
      };
    };
    signInAnonymously(): Promise<{ data: null; error: null }>;
    signInWithOtp(credentials: SignInWithOtpCredentials): Promise<{ data: { messageId: null; session: null; user: null }; error: unknown }>;
    signOut(): Promise<{ error: unknown }>;
    signUp(): Promise<{ data: null; error: null }>;
  };
  authListenerUnsubscribeCallCount: number;
  emit(event: AuthChangeEvent, session: SessionValue): void;
  initialSessionEmitCount: number;
  signInAnonymouslyCallCount: number;
  signInWithOtpCalls: SignInWithOtpCredentials[];
  signUpCallCount: number;
  value: unknown;
};

type SignInWithOtpCredentials = {
  email: string;
  options?: {
    emailRedirectTo?: string;
  };
};

function makeClientDouble(options: ClientDoubleOptions): SupabaseAuthClientDouble {
  let authListener: ((event: AuthChangeEvent, session: SessionValue) => void) | null = null;
  let authListenerUnsubscribeCallCount = 0;
  let initialSessionEmitCount = 0;
  let signInAnonymouslyCallCount = 0;
  const signInWithOtpCalls: SignInWithOtpCredentials[] = [];
  let signUpCallCount = 0;
  const emitInitialSessionEvent = options.emitInitialSessionEvent ?? true;
  const initialSessionEventSession = options.initialSessionEventSession ?? null;

  const value = {
    auth: {
      async getSession(): Promise<SessionResult> {
        return resolveOutcome(options.sessionOutcome, { data: { session: null }, error: null });
      },
      onAuthStateChange(callback: (event: AuthChangeEvent, session: SessionValue) => void) {
        authListener = callback;
        if (emitInitialSessionEvent) {
          queueMicrotask(() => {
            if (authListener === null) {
              return;
            }

            initialSessionEmitCount += 1;
            authListener("INITIAL_SESSION", initialSessionEventSession);
          });
        }

        return {
          data: {
            subscription: {
              unsubscribe() {
                authListener = null;
                authListenerUnsubscribeCallCount += 1;
              }
            }
          }
        };
      },
      async signInAnonymously() {
        signInAnonymouslyCallCount += 1;
        return { data: null, error: null };
      },
      async signInWithOtp(credentials: SignInWithOtpCredentials) {
        signInWithOtpCalls.push(credentials);
        return {
          data: { messageId: null, session: null, user: null },
          error: options.signInError ?? null
        };
      },
      async signOut() {
        return { error: options.signOutError ?? null };
      },
      async signUp() {
        signUpCallCount += 1;
        return { data: null, error: null };
      }
    }
  };

  return {
    get authListenerUnsubscribeCallCount() {
      return authListenerUnsubscribeCallCount;
    },
    auth: value.auth,
    emit(event: AuthChangeEvent, session: SessionValue): void {
      authListener?.(event, session);
    },
    get initialSessionEmitCount() {
      return initialSessionEmitCount;
    },
    get signInAnonymouslyCallCount() {
      return signInAnonymouslyCallCount;
    },
    signInWithOtpCalls,
    get signUpCallCount() {
      return signUpCallCount;
    },
    value
  };
}

function makeDeferred<TValue>(): Deferred<TValue> {
  let resolve: ((value: TValue) => void) | null = null;
  let reject: ((error: unknown) => void) | null = null;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject(error: unknown): void {
      reject?.(error);
    },
    resolve(value: TValue): void {
      resolve?.(value);
    }
  };
}

function makeSession(email: string): SessionValue {
  return {
    user: {
      email
    }
  };
}

async function resolveOutcome<TValue>(outcome: Outcome<TValue> | undefined, fallback: TValue): Promise<TValue> {
  if (outcome === undefined) {
    return fallback;
  }

  return outcome;
}
