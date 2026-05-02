---
date: 2026-04-26
model: gpt-5
description: "Deep Agents API observations and binding decisions for the session-digest implementation."
---

# Session Digest Architecture Amendment

## API observations

Installed versions observed from the workspace are `deepagents@1.9.0`, `@langchain/openai@1.4.4`, and `@langchain/core@1.1.41`.

The `deepagents` package root imports `@langchain/anthropic` even when the caller provides a custom model. That package is listed as a `deepagents` devDependency, not a runtime dependency, so `import("deepagents")` fails with `ERR_MODULE_NOT_FOUND` unless `@langchain/anthropic` is also installed. The probe used a temporary `npm install --no-save @langchain/anthropic@1.3.26` to observe the installed Deep Agents API. Task 8 must make a source-controlled dependency decision before importing `deepagents` from production code.

Subagent names with spaces are accepted by `createDeepAgent`. The probe constructed subagents named exactly `Extractor`, `Improver`, and `Evidence checker`, and task tool calls using those exact `subagent_type` values executed successfully. The parent agent name also accepted spaces, kebab-case, and title case when a valid model was supplied.

For a three-task fixture, the probe observed five model calls: one parent call that emitted three `task` tool calls, one call per configured subagent, and one final parent call after the task tool results. The parent model was bound with built-in tools including `task`; each subagent model call was bound with built-in filesystem/todo tools but not `task`.

Routing-substring observation: the subagent model calls included the configured role prompts and therefore contained the literal substrings `Extractor`, `Improver`, and `Evidence checker` respectively. The parent calls did not include those role-name substrings in the recorded message text, although the first parent call was bound to a `task` tool whose schema accepts the configured subagent names.

Final-message structure: `createDeepAgent().invoke(...)` returned an object with top-level keys `messages`, `todos`, and `files`. It did not expose a dedicated per-subagent output map. The `messages` array contained the parent `AIMessage` with three `tool_calls`, followed by three `ToolMessage` values named `task` whose `tool_call_id` values matched the parent tool call ids, followed by the final parent `AIMessage`. Each task `ToolMessage.content` contained the corresponding subagent's final content.

`ChatOpenAI` construction in `@langchain/openai@1.4.4` accepted both `apiKey` and `openAIApiKey`, and accepted both top-level `baseURL` and nested `configuration: { baseURL }`. Task 8 should use `apiKey`, `model`, and `configuration: { baseURL: "https://integrate.api.nvidia.com/v1" }` because the nested form matches the official OpenAI client option shape and the plan already calls out `baseURL` quirks.

`BaseChatModel` imports successfully from `@langchain/core/language_models/chat_models`. The broader `@langchain/core/language_models` subpath is not exported.

### Other findings

The task tool hides subagent intermediate messages but returns the subagent final content as `ToolMessage.content`. That is enough for section extraction if the implementation correlates each `ToolMessage.tool_call_id` with the immediately preceding parent `AIMessage.tool_calls[*].args.subagent_type` value.

The Deep Agents default runtime adds filesystem, todo, patch, and summarization middleware to subagents. This does not violate ADR-001 as long as `session-digest` only uses Deep Agents for digest orchestration and does not introduce repo/worktree inspection, cross-session persistence, or extra user-facing tool surfaces.

## Section-extraction strategy decision

`createDeepAgent` does not expose a separate per-subagent output object. It does expose attributable task outputs through the returned top-level message history: parent task tool calls identify `subagent_type`, and returned task `ToolMessage` entries carry matching `tool_call_id` values and final subagent content.

Task 8 should replace the assumed direct per-subagent output map with a task-message correlation strategy. The implementation must parse the returned `messages` array, build a map from task tool-call id to `subagent_type`, parse each matching task `ToolMessage.content` as the JSON section envelope, and accept only the sections owned by that subagent role. This preserves ADR-001's role split and still invokes exactly three Deep Agents subagents.

## Fake-LLM strategy

Use a RoutingFake with shared call recording and deterministic routing by call context. It should return a parent `AIMessage` with three `task` tool calls on the initial parent call, return role-specific JSON envelopes when the prompt contains `Extractor`, `Improver`, or `Evidence checker`, and return a final parent message after the tool results. This strategy is justified because the probe confirmed role-name substrings reach the subagent model calls and the returned message history preserves task-call attribution.

Task 8 tests should not depend on a direct per-subagent output field. They should assert that `agents.run` extracts sections from task `ToolMessage` content through tool-call attribution and rejects absent or blank required sections after ownership filtering.

## Task 8 redraft required?

YES

Redraft the Task 8 Architecture, Section extraction strategy, Test injection, RED tests, and GREEN flow subsections before writing any Task 8 RED test. The redraft must add the source-controlled dependency decision for `@langchain/anthropic`, replace direct per-subagent output assumptions with task-message correlation, and pin the `ChatOpenAI` constructor to `apiKey`, `model`, and `configuration.baseURL`.
