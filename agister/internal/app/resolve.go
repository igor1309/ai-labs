package app

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Refusal is why a call cannot proceed. It is recorded as the run's outcome.
type Refusal struct{ Reason string }

func (r *Refusal) Error() string { return r.Reason }

func refuse(format string, args ...any) error { return &Refusal{Reason: fmt.Sprintf(format, args...)} }

// resolution is everything a call needs before inputs and effects. Each
// consumer is given its own translation of it (see Resolver.Snapshot and
// Resolver.InspectProcess).
type resolution struct {
	service   definition.Service
	process   definition.Process
	policy    *definition.Policy
	agent     definition.Agent
	mapping   definition.Mapping
	schema    []byte
	prompts   map[string]definition.Prompt // by name
	sources   []definition.Source
	effective policy.Effective
	identity  RuntimeIdentity
	plan      enforce.Plan
	// setup is the setup the call's checkout runs (ADR-012); nil when none.
	setup *resolvedSetup
}

// resolvedSetup is a call's effective setup and the document it came from.
type resolvedSetup struct {
	definition.Setup
	from string // run.SetupFromProcess or run.SetupFromWorkspace
	path string
}

// Resolver loads and checks definitions, composes limits, checks the
// runtime and plans enforcement. Every failure is a refusal.
type Resolver struct {
	definitions ResolverDefinitions
	identities  ResolverIdentities
	validator   ResolverValidator
}

// ResolverDefinitions supplies the documents a call or a view is resolved
// from.
type ResolverDefinitions interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

// ResolverIdentities asks a runtime adapter what it reports about itself,
// to check the runtime a call would use.
type ResolverIdentities interface {
	Identity(ctx context.Context, adapter, command string) (RuntimeIdentity, error)
}

// ResolverValidator compiles an output schema.
type ResolverValidator interface {
	Compile(schema []byte) error
}

// ResolverAdapters are what a Resolver runs on besides the settings it
// resolves from.
type ResolverAdapters struct {
	Identities ResolverIdentities
	Validator  ResolverValidator
}

// NewResolver returns the component that resolves a process into what a
// call or a view needs. Every collaborator is required.
func NewResolver(definitions ResolverDefinitions, identities ResolverIdentities, validator ResolverValidator) *Resolver {
	return &Resolver{definitions: definitions, identities: identities, validator: validator}
}

// frozen returns a resolver over the definitions as they are now, which
// reads nothing else afterwards (see the package function Snapshot).
func (r *Resolver) frozen(ctx context.Context) *Resolver {
	copied := *r
	copied.definitions = Snapshot(ctx, r.definitions)
	return &copied
}

// overrides are the caller's narrowing limits.
type overrides struct {
	timeout    string
	maxCostUSD *float64
}

// resolve resolves the process named processName. A refused one's
// resolution has what was resolved before the refusal.
func (r *Resolver) resolve(ctx context.Context, processName, agentOverride string, caller overrides) (*resolution, error) {
	res := &resolution{}
	load := func(kind definition.Kind, name string) (definition.Document, error) {
		doc, err := r.definitions.Read(ctx, kind, name)
		if err != nil {
			return doc, refuse("%s %q: %v", kind.Singular(), name, err)
		}
		res.sources = append(res.sources, doc.Source)
		return doc, nil
	}
	parsed := func(err error) error {
		var invalid *definition.InvalidError
		if errors.As(err, &invalid) {
			return refuse("%v", err)
		}
		return err
	}

	doc, err := load(definition.KindService, "service")
	if err != nil {
		return res, err
	}
	if res.service, err = definition.ParseService(doc); err != nil {
		return res, parsed(err)
	}
	if doc, err = load(definition.KindProcess, processName); err != nil {
		return res, err
	}
	if res.process, err = definition.ParseProcess(doc); err != nil {
		return res, parsed(err)
	}
	if err := r.resolveSetup(ctx, res, load, parsed); err != nil {
		return res, err
	}
	if res.process.Policy != "" {
		if doc, err = load(definition.KindPolicy, res.process.Policy); err != nil {
			return res, err
		}
		pol, err := definition.ParsePolicy(doc)
		if err != nil {
			return res, parsed(err)
		}
		res.policy = &pol
	}
	agentName := res.process.Agent
	if agentOverride != "" {
		agentName = agentOverride
	}
	if doc, err = load(definition.KindAgent, agentName); err != nil {
		return res, err
	}
	if res.agent, err = definition.ParseAgent(doc); err != nil {
		return res, parsed(err)
	}
	if doc, err = load(definition.KindRuntime, res.agent.Runtime); err != nil {
		return res, err
	}
	if res.mapping, err = definition.ParseMapping(doc); err != nil {
		return res, parsed(err)
	}
	if unknown := res.mapping.UnknownPermissions(res.service.Permissions); len(unknown) > 0 {
		return res, refuse("runtime mapping %s grants permissions not in the vocabulary: %s", res.mapping.Name, strings.Join(unknown, ", "))
	}
	if res.agent.Effort != "" && !contains(res.mapping.Efforts, res.agent.Effort) {
		return res, refuse("agent %s: effort %q is not supported by runtime %s (supported: %s)", res.agent.Name, res.agent.Effort, res.mapping.Name, strings.Join(res.mapping.Efforts, ", "))
	}
	if res.process.Output.Format == "json" {
		if doc, err = load(definition.KindSchema, res.process.Output.Schema); err != nil {
			return res, err
		}
		res.schema = doc.Bytes
		// Fail before the agent runs, not when its output is validated.
		if err := r.validator.Compile(res.schema); err != nil {
			return res, refuse("schema %q: %v", res.process.Output.Schema, err)
		}
	}
	// The verification a process names is the call's from here on
	// (ADR-010 rule 3); without it the call is refused, never run unverified.
	if name := res.process.VerifyName; name != "" {
		if doc, err = load(definition.KindVerify, name); err != nil {
			return res, refuse("process %s names verify:%s: %v", res.process.Name, name, err)
		}
		verification, err := definition.ParseVerify(doc)
		if err != nil {
			return res, parsed(err)
		}
		res.process.Verify = &verification.Verify
	}
	// Each prompt a process names is read with the call, from the same
	// settings, and recorded among its sources (ADR-013 rule 3).
	for _, value := range res.process.Values {
		name := value.Args["name"]
		if _, ok := res.prompts[name]; ok || value.Source != definition.PromptSource {
			continue
		}
		if doc, err = load(definition.KindPrompt, name); err != nil {
			return res, refuse("input %s: %v", value.Name, err)
		}
		prompt, err := definition.ParsePrompt(doc)
		if err != nil {
			return res, parsed(err)
		}
		if res.prompts == nil {
			res.prompts = map[string]definition.Prompt{}
		}
		res.prompts[name] = prompt
	}

	limits := policy.Caller{MaxCostUSD: caller.maxCostUSD}
	if caller.timeout != "" {
		timeout, err := time.ParseDuration(caller.timeout)
		if err != nil || timeout <= 0 {
			return res, refuse("invalid timeout %q", caller.timeout)
		}
		limits.Timeout = &timeout
	}
	if caller.maxCostUSD != nil && *caller.maxCostUSD <= 0 {
		return res, refuse("invalid cost limit %g", *caller.maxCostUSD)
	}
	if res.effective, err = policy.Compose(res.service, res.policy, res.process, limits); err != nil {
		return res, refuse("%v", err)
	}

	// A repair turn resumes the call's own session (ADR-002 rule 4).
	if verify := res.process.Verify; verify.Repairs() && res.agent.Session != definition.SessionResumable {
		return res, refuse("verify.max_attempts %d repairs in the call's session, but agent %s is %s", verify.MaxAttempts, res.agent.Name, res.agent.Session)
	}

	if res.identity, err = r.identities.Identity(ctx, res.mapping.Adapter, res.agent.Command); err != nil {
		return res, refuse("runtime %s is unavailable: %v", res.mapping.Name, err)
	}
	if res.identity.Contract != res.mapping.Contract {
		return res, refuse("runtime mapping %s describes adapter contract %s, but the adapter implements %s", res.mapping.Name, res.mapping.Contract, res.identity.Contract)
	}
	if verify := res.process.Verify; verify.Repairs() && !res.identity.Resume {
		return res, refuse("verify.max_attempts %d repairs in the call's session, but runtime %s cannot resume sessions", verify.MaxAttempts, res.mapping.Name)
	}
	verified, unverified := res.mapping.ForVersion(res.identity.Version)
	if len(verified.Primitives) == 0 {
		return res, refuse("runtime mapping %s verifies no primitive for %s version %s", res.mapping.Name, res.mapping.Adapter, res.identity.Version)
	}
	if res.effective.MaxCostUSD != nil && !res.identity.CostLimit {
		return res, refuse("runtime %s cannot enforce the cost limit %g", res.mapping.Name, *res.effective.MaxCostUSD)
	}
	// The staleness limits on tool calls need the adapter to report them.
	if stale := res.effective.Stale; !res.identity.ToolCalls {
		switch {
		case stale.ToolCommand != nil:
			return res, refuse("runtime %s does not report tool calls, so it cannot enforce stale.tool_command %s", res.mapping.Name, *stale.ToolCommand)
		case stale.RepeatedToolCalls != nil:
			return res, refuse("runtime %s does not report tool calls, so it cannot enforce stale.repeated_tool_calls %d", res.mapping.Name, *stale.RepeatedToolCalls)
		}
	}
	if res.plan, err = enforce.Make(res.effective.Permissions, verified, res.effective.Require, res.service.StateReaching); err != nil {
		return res, refuse("runtime %s: %v%s", res.mapping.Name, err, unverifiedNote(unverified, "for version "+res.identity.Version))
	}
	if tools := res.identity.SkillTools; len(tools) > 0 && !slices.ContainsFunc(tools, func(tool string) bool { return contains(res.plan.Primitives, tool) }) {
		return res, refuse("runtime %s needs %s to use the repository's skills (ADR-006), and the plan grants no such tool: %s",
			res.mapping.Name, strings.Join(tools, " or "), withoutSkillTools(res, tools, verified, unverified))
	}
	return res, nil
}

// resolveSetup fixes the setup a call's checkout runs: the process's own,
// or the workspace settings' default, read only when it applies, so the
// call's definitions name the document its setup came from (ADR-012).
func (r *Resolver) resolveSetup(ctx context.Context, res *resolution, load func(definition.Kind, string) (definition.Document, error), parsed func(error) error) error {
	process := res.process
	var workspace *definition.Workspace
	if process.Checkout != "" && process.Setup == nil {
		names, err := r.definitions.List(ctx, definition.KindWorkspace)
		if err != nil {
			return refuse("workspace settings: %v", err)
		}
		if contains(names, string(definition.KindWorkspace)) {
			doc, err := load(definition.KindWorkspace, string(definition.KindWorkspace))
			if err != nil {
				return err
			}
			parsedWorkspace, err := definition.ParseWorkspace(doc)
			if err != nil {
				return parsed(err)
			}
			workspace = &parsedWorkspace
		}
	}
	setup, fromWorkspace := process.EffectiveSetup(workspace)
	switch {
	case setup == nil:
	case fromWorkspace:
		res.setup = &resolvedSetup{Setup: *setup, from: run.SetupFromWorkspace, path: workspace.Source.Path}
	default:
		res.setup = &resolvedSetup{Setup: *setup, from: run.SetupFromProcess, path: process.Source.Path}
	}
	return nil
}

// withoutSkillTools says why the plan grants none of tools: each is
// unverified for the version, absent from the mapping, or needs
// permissions the plan withholds or the effective permissions do not
// allow.
func withoutSkillTools(res *resolution, tools []string, verified definition.Mapping, unverified []string) string {
	// What a primitive may grant: the effective permissions, less the
	// state-reaching ones, which the plan withholds (enforce.Make).
	allowed := slices.DeleteFunc(slices.Clone(res.effective.Permissions), func(p string) bool { return contains(res.service.StateReaching, p) })
	var reasons []string
	for _, tool := range tools {
		i := slices.IndexFunc(verified.Primitives, func(p definition.Primitive) bool { return p.Name == tool })
		switch {
		case i >= 0:
			var withheld, disallowed []string
			for _, grant := range verified.Primitives[i].Grants {
				switch {
				case contains(allowed, grant):
				case contains(res.plan.Withheld, grant):
					withheld = append(withheld, grant)
				default:
					disallowed = append(disallowed, grant)
				}
			}
			var parts []string
			if len(withheld) > 0 {
				parts = append(parts, strings.Join(withheld, ", ")+", which the plan withholds")
			}
			if len(disallowed) > 0 {
				parts = append(parts, strings.Join(disallowed, ", ")+", which the effective permissions do not allow")
			}
			if len(parts) == 0 {
				reasons = append(reasons, "the plan does not grant "+tool)
			} else {
				reasons = append(reasons, tool+" needs "+strings.Join(parts, ", and "))
			}
		case contains(unverified, tool):
			reasons = append(reasons, tool+" is not verified for version "+res.identity.Version)
		default:
			reasons = append(reasons, "runtime mapping "+res.mapping.Name+" has no "+tool)
		}
	}
	return strings.Join(reasons, "; ")
}

// workflowResolution is a workflow and its nodes' processes, as a run of it
// uses them. Each node's call resolves its own process again, fully.
type workflowResolution struct {
	workflow  definition.Workflow
	processes map[string]definition.Process
	sources   []definition.Source // the workflow's document
}

// workflow resolves the workflow named name, refusing one whose nodes
// cannot run as ADR-003 has them (settings.WorkflowProblems). found is
// false when the settings list no workflow of that name.
func (r *Resolver) workflow(ctx context.Context, name string) (*workflowResolution, bool, error) {
	names, err := r.definitions.List(ctx, definition.KindWorkflow)
	if err != nil || !contains(names, name) {
		return nil, false, nil
	}
	res := &workflowResolution{processes: map[string]definition.Process{}}
	doc, err := r.definitions.Read(ctx, definition.KindWorkflow, name)
	if err != nil {
		return res, true, refuse("workflow %q: %v", name, err)
	}
	res.sources = append(res.sources, doc.Source)
	if res.workflow, err = definition.ParseWorkflow(doc); err != nil {
		return res, true, refuse("%v", err)
	}
	for _, node := range res.workflow.Nodes() {
		if _, ok := res.processes[node.Process]; ok {
			continue
		}
		doc, err := r.definitions.Read(ctx, definition.KindProcess, node.Process)
		if err != nil {
			continue // a process that does not exist is a workflow problem
		}
		process, err := definition.ParseProcess(doc)
		if err != nil {
			return res, true, refuse("node %s: %v", node.Name, err)
		}
		res.processes[node.Process] = process
	}
	if problems := settings.WorkflowProblems(res.workflow, res.processes); len(problems) > 0 {
		return res, true, refuse("workflow %s: %s", name, strings.Join(problems, "; "))
	}
	return res, true, nil
}

// unverifiedNote names the primitives a refused plan could not use.
func unverifiedNote(unverified []string, scope string) string {
	if len(unverified) == 0 {
		return ""
	}
	return fmt.Sprintf(" (not verified %s: %s)", scope, strings.Join(unverified, ", "))
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
