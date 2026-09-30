# The repository's own settings (<repository root>/.agister) run on the fake
# runtimes: each mutation breaks one settings file, or drops the verification
# a process declares, and the test that runs every process must fail with it.
# Files are relative to the module, so the settings are under ../.agister.
# Run: scripts/revert-check.py <this file>
module: agister

[a process names an agent that does not exist]
file: ../.agister/processes/architecture_review_codex.yaml
find: uses: agent:codex-sol
replace: uses: agent:codex-missing
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a process names a policy that does not exist]
file: ../.agister/processes/decision_review_codex.yaml
find: policy: process-policy:codex-review
replace: policy: process-policy:codex-missing
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a process names a schema that does not exist]
file: ../.agister/processes/implement.yaml
find: schema: implementation
replace: schema: implementations
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a schema does not compile]
file: ../.agister/schemas/judgement.json
find: "type": "object",\n  "additionalProperties": false,\n  "required": ["summary", "items"],
replace: "type": "objekt",\n  "additionalProperties": false,\n  "required": ["summary", "items"],
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[an input source is not one Agister provides]
file: ../.agister/processes/tests_review_codex.yaml
find: review_prompt: {source: file,
replace: review_prompt: {source: files,
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a prompt path does not resolve from the repository root]
file: ../.agister/processes/clarity_review_codex.yaml
find: path: prompts/code-review-clarity.md
replace: path: agister/prompts/code-review-clarity.md
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a prompt file a process reads is missing]
file: ../.agister/processes/review_judge.yaml
find: path: prompts/code-review-judge.md
replace: path: prompts/code-review-judges.md
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[an agent names a runtime mapping that does not exist]
file: ../.agister/agents/codex-sol.toml
find: runtime = "codex"
replace: runtime = "codex-missing"
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[the runtime mapping verifies no primitive for the version installed]
file: ../.agister/runtimes/codex.yaml
find: verified: ["0.158.", "0.159."]
replace: verified: ["0.160."]
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a policy does not parse]
file: ../.agister/policies/implement.yaml
find: max_cost_usd: 25\n
replace: max_cost_usd: -1\n
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes

[a process that declares verify completes without verification]
file: internal/app/calls.go
find: if fault == nil && res.process.Verify != nil {
replace: if fault == nil && res.process.Verify != nil && false {
test: ./cmd/agister TestRepositoryProcessesRunOnFakeRuntimes
