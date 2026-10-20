import {
  type ClientTurnRequestId,
  type DeltaPresentation,
  type PromptInput,
  type ThreadDelta,
  BRIDGE_JSON_RPC_ERRORS,
  BRIDGE_NOTIFICATION_METHODS,
  BRIDGE_REQUEST_METHODS,
  PROVIDER_BRIDGE_PROTOCOL_VERSION,
  THREAD_DELTA_GRAMMAR_V3,
  THREAD_DELTA_NOTIFICATION_METHOD,
  createBridgeIo,
  experimental_presentationTitle as presentationTitle,
  experimental_withTitle as withTitle,
  initializeParamsSchema,
  modelListParamsSchema,
  runBridgeRequest,
  threadResumeParamsSchema,
  threadStartParamsSchema,
  threadStopParamsSchema,
  turnStartParamsSchema,
  turnSteerParamsSchema,
} from "@get-bb/plugin-sdk/provider-bridge";
import {
  type AgisterRun,
  type AgisterRunEnd,
  type StartAgisterRunArgs,
  agisterArgs,
  agisterEnv,
  recordPathFor,
  startAgisterRun,
} from "./agister-run.js";
import {
  AGISTER_EXECUTABLE,
  AGISTER_WORKFLOW,
  RUN_STATE_KIND,
  SPIKE_MODEL,
  SPIKE_MODEL_ID,
  type RunState,
} from "./vocabulary.js";

// thread/stop is answered within the runtime's 30 s request timeout, so
// Agister gets 20 s to cancel its steps and write its record.
export const STOP_GRACE_MS = 20_000;
// A bridge being shut down is SIGKILLed with its group 5 s after its
// SIGTERM (process-utils, stopProcessGroupLeaderFirst).
export const SHUTDOWN_GRACE_MS = 4_000;

const AGENT_MESSAGE_PRESENTATION: DeltaPresentation = {
  label: { pending: "Reporting", completed: "Agister result" },
  icon: { glyph: "Workflow" },
};

type JsonRpcId = string | number;
type OutboundMessage = { jsonrpc: "2.0" } & Record<string, unknown>;

interface ActiveTurn {
  ordinal: number;
  run: AgisterRun;
  stopRequested: boolean;
  settled: Promise<void>;
}

interface Session {
  threadId: string;
  providerThreadId: string;
  cwd: string;
  turns: number;
  active: ActiveTurn | null;
}

export interface AgisterBridgeOptions {
  // The bridge's own environment; Agister gets only its allowlist.
  env: NodeJS.ProcessEnv;
  write?: (line: string) => void;
  start?: (args: StartAgisterRunArgs) => AgisterRun;
  exit?: (code: number) => void;
}

export function createAgisterBridge(options: AgisterBridgeOptions) {
  const io = createBridgeIo<OutboundMessage>(
    options.write === undefined ? {} : { write: options.write },
  );
  const start = options.start ?? startAgisterRun;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const env = agisterEnv(options.env);
  const sessions = new Map<string, Session>();

  function notify(method: string, params: Record<string, unknown>): void {
    io.send({ jsonrpc: "2.0", method, params });
  }

  function emit(threadId: string, deltas: ThreadDelta[]): void {
    notify(THREAD_DELTA_NOTIFICATION_METHOD, { threadId, deltas });
  }

  function invalidParams(id: JsonRpcId, method: string, issues: unknown): void {
    io.send({
      jsonrpc: "2.0",
      id,
      error: {
        code: BRIDGE_JSON_RPC_ERRORS.INVALID_PARAMS,
        message: `Invalid params for ${method}`,
        data: issues,
      },
    });
  }

  function openSession(threadId: string, providerThreadId: string, cwd: string): void {
    sessions.set(threadId, { threadId, providerThreadId, cwd, turns: 0, active: null });
    notify(BRIDGE_NOTIFICATION_METHODS.threadIdentity, { threadId, providerThreadId });
    emit(threadId, [{ kind: "session.reset" }]);
  }

  function runTurn(
    session: Session,
    input: readonly PromptInput[],
    clientRequestId: ClientTurnRequestId | undefined,
  ): void {
    const prompt = promptText(input);
    session.turns += 1;
    const ordinal = session.turns;
    const key = { providerItemId: `${session.providerThreadId}-t${ordinal}-agister` };
    const command = displayCommand(prompt);
    const cwd = session.cwd;
    const presentation = withTitle(
      {
        label: { pending: "Running Agister workflow", completed: "Ran Agister workflow" },
        icon: { glyph: "Workflow" },
      },
      presentationTitle(AGISTER_WORKFLOW),
    );
    emit(session.threadId, [
      ...(clientRequestId === undefined
        ? []
        : [{ kind: "input.accepted", clientRequestId } as const]),
      { kind: "turn.open" },
      { kind: "item.open", key, item: { type: "command", command, cwd }, presentation },
    ]);

    // Agister's stderr progress lines are for a person, not a contract
    // (docs/run-implementation.md, "Inputs and progress"); they are shown
    // as the command's output, verbatim, and never parsed.
    const run = start({
      cwd,
      prompt,
      env,
      onProgressLine: (line) => {
        if (session.active?.ordinal !== ordinal) return;
        emit(session.threadId, [
          { kind: "item.outputDelta", key, channel: "command", text: `${line}\n` },
        ]);
      },
    });
    const active: ActiveTurn = {
      ordinal,
      run,
      stopRequested: false,
      settled: Promise.resolve(),
    };
    session.active = active;
    active.settled = run.done.then((end) => {
      const settled = settle(end, active.stopRequested);
      emit(session.threadId, [
        {
          kind: "item.close",
          key,
          status: settled.itemStatus,
          ...(end.code === null ? {} : { exitCode: end.code }),
          aggregatedOutput: end.stderrTail,
          item: {
            type: "command",
            command,
            cwd,
            aggregatedOutput: end.stderrTail,
            ...(end.code === null ? {} : { exitCode: end.code }),
          },
          presentation,
        },
        ...(settled.state === null
          ? []
          : [{ kind: "extension.state", extensionKind: RUN_STATE_KIND, payload: settled.state } as const]),
        ...messageDeltas(`${key.providerItemId}-message`, settled.message),
        {
          kind: "turn.boundary",
          status: settled.turnStatus,
          ...(settled.error === null ? {} : { error: { message: settled.error } }),
        },
      ]);
      if (session.active === active) session.active = null;
    });
  }

  function settle(end: AgisterRunEnd, stopRequested: boolean) {
    const result = end.result;
    if (result !== null) {
      const recordPath = recordPathFor(result.run_id, env);
      const state: RunState = {
        runId: result.run_id,
        status: result.status,
        class: result.class,
        workflow: AGISTER_WORKFLOW,
        recordPath,
      };
      const turnStatus =
        result.status === "completed"
          ? ("completed" as const)
          : result.status === "interrupted"
            ? ("interrupted" as const)
            : ("failed" as const);
      return {
        state,
        turnStatus,
        itemStatus: turnStatus,
        error:
          turnStatus === "failed"
            ? `Agister run ${result.run_id} ended ${result.status}${result.class === null ? "" : ` (${result.class})`}${result.reason === null ? "" : `: ${result.reason}`}`
            : null,
        message: resultMessage(result, recordPath),
      };
    }
    // No result printed: a refusal, a bad command, a missing executable,
    // or a kill. Say exactly that; invent no run.
    const lastLine = end.stderrTail.trim().split("\n").at(-1) ?? "";
    const why =
      end.spawnError?.code === "ENOENT"
        ? `\`${AGISTER_EXECUTABLE}\` was not found on PATH.`
        : end.spawnError !== null
          ? `\`${AGISTER_EXECUTABLE}\` could not start: ${end.spawnError.message}`
          : end.signal === "SIGKILL" && stopRequested
            ? `Agister did not exit within ${STOP_GRACE_MS / 1000}s of SIGTERM and was killed. Its record reads \`lost\`, and a step it started may still be running.`
            : `Agister printed no result (exit ${end.code ?? end.signal}). ${lastLine}`;
    const status = stopRequested ? ("interrupted" as const) : ("failed" as const);
    return {
      state: null,
      turnStatus: status,
      itemStatus: status,
      error: status === "failed" ? why : null,
      message: why,
    };
  }

  function messageDeltas(id: string, text: string): ThreadDelta[] {
    const key = { providerItemId: id };
    return [
      { kind: "item.open", key, item: { type: "agentMessage", text: "" }, presentation: AGENT_MESSAGE_PRESENTATION },
      { kind: "item.textDelta", key, channel: "agentMessage", text },
      { kind: "item.textClose", key, channel: "agentMessage", text },
    ];
  }

  async function stopActive(session: Session, graceMs: number): Promise<void> {
    const active = session.active;
    if (active === null) return;
    active.stopRequested = true;
    await active.run.terminate(graceMs);
    await active.settled;
  }

  const handlers: Record<string, (id: JsonRpcId, params: unknown) => Promise<void> | void> = {
    [BRIDGE_REQUEST_METHODS.initialize]: (id, params) => {
      const parsed = initializeParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "initialize", parsed.error.issues);
      io.sendResult(id, {
        protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION,
        capabilities: {
          grammarVersions: [THREAD_DELTA_GRAMMAR_V3, THREAD_DELTA_GRAMMAR_V3],
          // A "session" is only the thread's worktree; a new bridge
          // process resumes it with nothing to restore.
          sessionRestore: true,
          threadArchive: false,
          threadRename: false,
          threadGoalClear: false,
          fork: "none",
          approvalEnforcedBy: "provider",
          steerMode: "queue",
        },
      });
    },

    [BRIDGE_REQUEST_METHODS.modelList]: (id, params) => {
      const parsed = modelListParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "model/list", parsed.error.issues);
      io.sendResult(id, {
        models: [{ ...SPIKE_MODEL, model: SPIKE_MODEL_ID }],
        selectedOnlyModels: [],
      });
    },

    [BRIDGE_REQUEST_METHODS.threadStart]: (id, params) => {
      const parsed = threadStartParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "thread/start", parsed.error.issues);
      // One bb thread is one provider session; its id names the thread.
      const providerThreadId = `agister-spike:${parsed.data.threadId}`;
      openSession(parsed.data.threadId, providerThreadId, parsed.data.cwd);
      io.sendResult(id, { providerThreadId, sessionRestorable: true });
      const session = sessions.get(parsed.data.threadId);
      if (session !== undefined && parsed.data.input !== undefined && parsed.data.input.length > 0) {
        runTurn(session, parsed.data.input, undefined);
      }
    },

    [BRIDGE_REQUEST_METHODS.threadResume]: (id, params) => {
      const parsed = threadResumeParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "thread/resume", parsed.error.issues);
      openSession(parsed.data.threadId, parsed.data.providerThreadId, parsed.data.cwd);
      io.sendResult(id, { providerThreadId: parsed.data.providerThreadId, sessionRestorable: true });
    },

    [BRIDGE_REQUEST_METHODS.turnStart]: (id, params) => {
      const parsed = turnStartParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "turn/start", parsed.error.issues);
      const session = sessions.get(parsed.data.threadId);
      if (session === undefined) {
        return io.sendError(id, BRIDGE_JSON_RPC_ERRORS.INVALID_PARAMS, `No session for thread ${parsed.data.threadId}`);
      }
      if (session.active !== null) {
        return io.sendError(id, BRIDGE_JSON_RPC_ERRORS.BRIDGE_ERROR, "An Agister run is already in progress in this thread");
      }
      io.sendResult(id, {});
      runTurn(session, parsed.data.input, parsed.data.clientRequestId);
    },

    [BRIDGE_REQUEST_METHODS.turnSteer]: (id, params) => {
      const parsed = turnSteerParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "turn/steer", parsed.error.issues);
      const session = sessions.get(parsed.data.threadId);
      if (session?.active == null) {
        return io.sendError(id, BRIDGE_JSON_RPC_ERRORS.NO_ACTIVE_TURN, "No active Agister run to steer");
      }
      io.sendError(id, BRIDGE_JSON_RPC_ERRORS.BRIDGE_ERROR, "An Agister run takes no input once it has started");
    },

    // Both intents leave the bridge holding nothing for the thread. With a
    // run in flight, the run is cancelled through Agister's own SIGTERM
    // handling and its result is on the wire before this answer.
    [BRIDGE_REQUEST_METHODS.threadStop]: async (id, params) => {
      const parsed = threadStopParamsSchema.safeParse(params);
      if (!parsed.success) return invalidParams(id, "thread/stop", parsed.error.issues);
      const session = sessions.get(parsed.data.threadId);
      if (session !== undefined) await stopActive(session, STOP_GRACE_MS);
      sessions.delete(parsed.data.threadId);
      io.sendResult(id, {});
    },
  };

  function handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) return;
    const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown };
    if (typeof method !== "string") return;
    if (typeof id !== "string" && typeof id !== "number") return;
    const handler = handlers[method];
    if (handler === undefined) {
      io.sendError(id, BRIDGE_JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`);
      return;
    }
    runBridgeRequest({
      request: { id, method, params },
      sendError: io.sendError,
      handleRequest: async (request) => handler(request.id, request.params),
    });
  }

  let shuttingDown: Promise<void> | null = null;
  // SIGTERM (bridge retired, daemon restart) or stdin closed (daemon gone):
  // cancel every run through Agister, bounded, then exit.
  function shutdown(): Promise<void> {
    shuttingDown ??= Promise.all(
      [...sessions.values()].map((session) => stopActive(session, SHUTDOWN_GRACE_MS)),
    ).then(() => exit(0));
    return shuttingDown;
  }

  return { handleLine, shutdown, activeRunPids: () => [...sessions.values()].flatMap((s) => (s.active?.run.pid === undefined ? [] : [s.active.run.pid])) };
}

function promptText(input: readonly PromptInput[]): string {
  return input
    .filter((item): item is Extract<PromptInput, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("");
}

// What the command row shows: the argv as Agister receives it, each
// element quoted, the prompt cut for display only.
function displayCommand(prompt: string): string {
  const shown = prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt;
  return [AGISTER_EXECUTABLE, ...agisterArgs(shown)].map((arg) => JSON.stringify(arg)).join(" ");
}

function resultMessage(
  result: NonNullable<AgisterRunEnd["result"]>,
  recordPath: string | null,
): string {
  const lines = [
    `Agister run \`${result.run_id}\` ended **${result.status}**${result.class === null ? "" : ` (${result.class})`}.`,
    "",
    `- Workflow: \`${AGISTER_WORKFLOW}\``,
    `- Record: ${recordPath === null ? "unknown" : `\`${recordPath}\``}`,
    `- Export: \`agister runs export ${result.run_id} --to <dir>\``,
  ];
  if (result.reason !== null) lines.push(`- Reason: ${result.reason}`);
  if (result.warnings.length > 0) lines.push(`- Warnings: ${result.warnings.length}`);
  lines.push("", "```json", JSON.stringify(result.output ?? null, null, 2).slice(0, 8_000), "```");
  return lines.join("\n");
}
