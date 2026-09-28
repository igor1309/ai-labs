package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// Refusal is why a call cannot proceed. It is recorded as the run's outcome.
type Refusal struct{ Reason string }

func (r *Refusal) Error() string { return r.Reason }

func refuse(format string, args ...any) error { return &Refusal{Reason: fmt.Sprintf(format, args...)} }

// resolution is everything a call needs before inputs and effects.
type resolution struct {
	service   definition.Service
	process   definition.Process
	policy    *definition.Policy
	agent     definition.Agent
	mapping   definition.Mapping
	schema    []byte
	sources   []definition.Source
	effective policy.Effective
	runner    TurnRunner
	identity  RuntimeIdentity
	plan      enforce.Plan
}

// resolver loads and checks definitions, composes limits, checks the
// runtime and plans enforcement. Every failure is a refusal.
type resolver struct {
	definitions DefinitionSource
	runtimes    Runtimes
	validator   OutputValidator
}

func (r resolver) resolve(ctx context.Context, processName, agentOverride, callerTimeout string) (*resolution, error) {
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

	var caller policy.Caller
	if callerTimeout != "" {
		timeout, err := time.ParseDuration(callerTimeout)
		if err != nil || timeout <= 0 {
			return res, refuse("invalid timeout %q", callerTimeout)
		}
		caller.Timeout = &timeout
	}
	if res.effective, err = policy.Compose(res.service, res.policy, res.process, caller); err != nil {
		return res, refuse("%v", err)
	}

	if res.runner, err = r.runtimes.Runner(res.mapping.Adapter, res.agent.Command); err != nil {
		return res, refuse("runtime mapping %s: %v", res.mapping.Name, err)
	}
	if res.identity, err = res.runner.Identity(ctx); err != nil {
		return res, refuse("runtime %s is unavailable: %v", res.mapping.Name, err)
	}
	if res.identity.Contract != res.mapping.Contract {
		return res, refuse("runtime mapping %s describes adapter contract %s, but the adapter implements %s", res.mapping.Name, res.mapping.Contract, res.identity.Contract)
	}
	if !res.mapping.Verified(res.identity.Version) {
		return res, refuse("runtime mapping %s is not verified for %s version %s (verified: %s)", res.mapping.Name, res.mapping.Adapter, res.identity.Version, strings.Join(res.mapping.VerifiedVersions, ", "))
	}
	if res.plan, err = enforce.Make(res.effective.Permissions, res.mapping, res.effective.Require, res.service.StateReaching); err != nil {
		return res, refuse("runtime %s: %v", res.mapping.Name, err)
	}
	return res, nil
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
