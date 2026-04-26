---
date: 2026-04-26
model: gpt-5
description: "NVIDIA NIM model probe results for session-digest Deep Agents experiments."
---

# NVIDIA NIM Model Probes

These results were gathered against `https://integrate.api.nvidia.com/v1` through the configured shell proxy. They are diagnostic observations for choosing a free NVIDIA-hosted model for the local `session-digest` prototype.

## Endpoint Baseline

- `GET /v1/models` returned `200` in about `0.7s`.
- The configured model was present in the model list.
- `meta/llama-3.2-1b-instruct` completed a minimal chat request in about `0.6s`, proving the API key, proxy, and chat-completions endpoint worked in general.

## Probe Results

| Model | Raw chat | Tool call | Small `session-digest` CLI run | Notes |
| --- | --- | --- | --- | --- |
| `deepseek-ai/deepseek-v4-pro` | Timed out after `120s` with zero response bytes | Not tested after raw timeout | Timed out/no output in full CLI run | Not usable in this environment during the probe window. |
| `deepseek-ai/deepseek-v4-flash` | Timed out after `120s` with zero response bytes | Not tested after raw timeout | Not tested after raw timeout | Flash behaved like Pro. |
| `moonshotai/kimi-k2-instruct` | Returned `Ok.` in about `1s` | `200`, tool call present in about `1.4s` | Returned quickly, then failed contract validation with `Missing digest section: Session summary.` | Best current candidate for the free-model prototype once output handling is loosened or prompts are tightened. |
| `moonshotai/kimi-k2-instruct-0905` | Not separately raw-chat probed | `200`, tool call present in about `1.6s` | Returned in about `12.7s`, then failed contract validation with `Missing digest section: Session summary.` | Similar to `kimi-k2-instruct`. |
| `z-ai/glm4.7` | Not separately raw-chat probed | `200`, tool call present in about `11.7s` | Returned in about `23.3s`, then failed contract validation with `Missing digest section: Session summary.` | Works, but slower than Kimi for tool calls. |
| `z-ai/glm-5.1` | Not separately raw-chat probed | Timed out after `45s` with zero response bytes | Not tested after tool-call timeout | Avoid for now. |
| `qwen/qwen3-coder-480b-a35b-instruct` | Not separately raw-chat probed | `200`, tool call present in about `5s` | Returned in about `2.9s`, then failed contract validation with `Missing digest section: Session summary.` | Good tool-call support; output contract still fails. |
| `qwen/qwen3-next-80b-a3b-instruct` | Not separately raw-chat probed | `200`, tool call present in about `1.3s` | Not tested through CLI | Possible fallback candidate. |
| `openai/gpt-oss-120b` | Not separately raw-chat probed | `200`, tool call present in about `0.8s` | Returned in about `2.7s`, then failed contract validation with `Missing digest section: Session summary.` | Fast tool-call behavior; output contract still fails. |
| `openai/gpt-oss-20b` | Not separately raw-chat probed | `200`, tool call present in about `1s` | Not tested through CLI | Possible fallback candidate. |
| `nvidia/nemotron-3-super-120b-a12b` | Not separately raw-chat probed | `200`, tool call present in about `2s` | Timed out with no stdout/stderr at `120s`, then again at `300s` after placeholder handling and transcript-data prompt hardening | Tool calls work, but the full Deep Agents run stalls for the small real session. |
| `meta/llama-3.3-70b-instruct` | Not separately raw-chat probed | `200`, tool call present in about `1.3s` | Not tested through CLI | Possible fallback candidate. |
| `mistralai/mistral-large` | Not separately raw-chat probed | Returned `404` | Not tested after `404` | The listed model id did not work on chat completions in this probe. |

## Current Recommendation

Use `moonshotai/kimi-k2-instruct` for local free-model smoke testing. It is fast, available, and supports tool calls. The next blocker is not model availability; it is the current `session-digest` extraction path requiring every owned section to be present in the exact JSON envelope returned by each Deep Agents task.
