import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, OPTIONS } from "./client.js";
import { createFixture, isAlive, type Fixture } from "./fixture.js";

let fixture: Fixture;

beforeEach(() => {
  fixture = createFixture();
});

afterEach(() => {
  const pid = fixture.stepPid();
  if (pid !== null && isAlive(pid)) process.kill(pid, "SIGKILL");
  fixture.cleanup();
});

function startThread(client: ReturnType<typeof createClient>, threadId: string) {
  client.request("thread/start", { threadId, cwd: fixture.repo, options: OPTIONS, instructionMode: "append" });
}

function turn(client: ReturnType<typeof createClient>, threadId: string, text: string): string {
  return client.request("turn/start", {
    threadId,
    providerThreadId: `agister-spike:${threadId}`,
    input: [{ type: "text", text, mentions: [] }],
    clientRequestId: "creq_abcdefghij",
    options: OPTIONS,
  });
}

function boundary(client: ReturnType<typeof createClient>, threadId: string) {
  return client.deltas(threadId).find((d) => d.kind === "turn.boundary") as
    | { status: string; error?: { message: string } }
    | undefined;
}

function runState(client: ReturnType<typeof createClient>, threadId: string) {
  const state = client.deltas(threadId).find((d) => d.kind === "extension.state");
  return (state as { payload: { runId: string; status: string; class: string | null; recordPath: string } } | undefined)?.payload;
}

function message(client: ReturnType<typeof createClient>, threadId: string): string {
  const close = client.deltas(threadId).find((d) => d.kind === "item.textClose") as { text: string } | undefined;
  return close?.text ?? "";
}

describe("one turn runs the fixed workflow", () => {
  it("passes the prompt as one argv value and reports Agister's result and run", async () => {
    const client = createClient({
      ...process.env,
      AGISTER_HOME: fixture.home,
      ANTHROPIC_API_KEY: "sk-must-not-leak",
    });
    startThread(client, "thr_smoke");
    const prompt = "hi $(whoami) `id`; --continue R1 --dir /etc";
    turn(client, "thr_smoke", prompt);

    const settled = await client.waitFor(() => boundary(client, "thr_smoke"));
    expect(settled.status).toBe("completed");

    const state = runState(client, "thr_smoke");
    expect(state).toMatchObject({ status: "completed", class: null });
    expect(state?.recordPath).toBe(`${fixture.home}/runs/${state?.runId}/record.json`);
    expect(fixture.record(state!.runId).status).toBe("completed");

    const text = message(client, "thr_smoke");
    expect(text).toContain(`Agister run \`${state!.runId}\` ended **completed**`);
    expect(text).toContain(`agister bash step got: ${prompt}`);
    expect(text).toContain("ANTHROPIC_API_KEY=unset");

    const progress = client
      .deltas("thr_smoke")
      .filter((d) => d.kind === "item.outputDelta")
      .map((d) => d.text);
    expect(progress).toEqual(["· say: started on bash\n", expect.stringMatching(/^· say: ended completed in /)]);
  }, 30_000);

  it("fails the turn, inventing no run, when agister is not on PATH", async () => {
    const client = createClient({ PATH: "/nonexistent", HOME: fixture.root, AGISTER_HOME: fixture.home });
    startThread(client, "thr_missing");
    turn(client, "thr_missing", "hello");
    const settled = await client.waitFor(() => boundary(client, "thr_missing"));
    expect(settled).toMatchObject({ status: "failed", error: { message: "`agister` was not found on PATH." } });
    expect(runState(client, "thr_missing")).toBeUndefined();
  }, 30_000);
});

describe("stop", () => {
  it("cancels the run through Agister, which records it interrupted, before answering", async () => {
    const client = createClient({ ...process.env, AGISTER_HOME: fixture.home });
    startThread(client, "thr_stop");
    turn(client, "thr_stop", "hold");
    const stepPid = await client.waitFor(() => fixture.stepPid());
    expect(isAlive(stepPid)).toBe(true);

    const stopId = client.request("thread/stop", {
      threadId: "thr_stop",
      providerThreadId: "agister-spike:thr_stop",
      activeTurnId: "bb-turn-1",
      intent: "interrupt",
    });
    await client.waitFor(() => client.messages.some((m) => m.id === stopId && m.method === undefined), 30_000);
    const answeredAt = client.indexOf((m) => m.id === stopId && m.method === undefined);
    expect(client.messages[answeredAt]?.error).toBeUndefined();

    const boundaryAt = client.indexOf((m) =>
      (m.params?.deltas ?? []).some((d) => d.kind === "turn.boundary"),
    );
    expect(boundaryAt).toBeGreaterThanOrEqual(0);
    expect(boundaryAt).toBeLessThan(answeredAt);
    expect(boundary(client, "thr_stop")?.status).toBe("interrupted");

    const state = runState(client, "thr_stop");
    expect(state).toMatchObject({ status: "interrupted", class: "cancelled" });
    const record = fixture.record(state!.runId);
    expect(record.status).toBe("interrupted");
    expect(record.result?.class).toBe("cancelled");
    expect(isAlive(stepPid)).toBe(false);
  }, 40_000);

  it("on bridge shutdown cancels the run through Agister, then exits", async () => {
    const client = createClient({ ...process.env, AGISTER_HOME: fixture.home });
    startThread(client, "thr_down");
    turn(client, "thr_down", "hold");
    const stepPid = await client.waitFor(() => fixture.stepPid());

    const started = Date.now();
    await client.bridge.shutdown();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(client.exits).toEqual([0]);

    const state = runState(client, "thr_down");
    expect(fixture.record(state!.runId).status).toBe("interrupted");
    expect(isAlive(stepPid)).toBe(false);
  }, 30_000);
});
