package app

import (
	"slices"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The run record owns its types (see run.DefinitionSource); these translate
// what a call resolved into them.

func recordSources(sources []CallSource) []run.DefinitionSource {
	if sources == nil {
		return nil
	}
	recorded := make([]run.DefinitionSource, len(sources))
	for i, source := range sources {
		recorded[i] = run.DefinitionSource{
			Kind:      source.Kind,
			Name:      source.Name,
			Path:      source.Path,
			SHA256:    source.SHA256,
			Project:   source.Project,
			Overrides: source.Overrides,
		}
	}
	return recorded
}

func recordAbsent(absent []CallAbsent) []run.AbsentPrompt {
	return translated(absent, func(absent CallAbsent) run.AbsentPrompt {
		return run.AbsentPrompt{Input: absent.Input, Prompt: absent.Prompt}
	})
}

func recordEffective(effective CallLimits) *run.EffectivePolicy {
	var stale *run.StaleLimits
	if effective.Stale != (CallStale{}) {
		stale = &run.StaleLimits{
			NoEvent:           effective.Stale.NoEvent,
			NoOutput:          effective.Stale.NoOutput,
			ToolCommand:       effective.Stale.ToolCommand,
			RepeatedToolCalls: effective.Stale.RepeatedToolCalls,
		}
	}
	return &run.EffectivePolicy{
		Timeout:     effective.Timeout,
		MaxAttempts: effective.MaxAttempts,
		MaxCostUSD:  effective.MaxCostUSD,
		Allow:       slices.Clone(effective.Allow),
		Deny:        slices.Clone(effective.Deny),
		Permissions: slices.Clone(effective.Permissions),
		Require:     slices.Clone(effective.Require),
		Access:      effective.Access,
		Scope:       effective.Scope,
		Stale:       stale,
	}
}

func recordVerify(verify *CallVerify) *run.Verify {
	if verify == nil {
		return nil
	}
	return &run.Verify{
		Command:     verify.Command,
		Timeout:     verify.Timeout,
		MaxAttempts: verify.MaxAttempts,
		Instruction: verify.Instruction,
	}
}

func recordSetup(setup *CallSetup) *run.Setup {
	if setup == nil {
		return nil
	}
	return &run.Setup{Command: setup.Command, Timeout: setup.Timeout, From: setup.From, Path: setup.Path}
}

func recordPlan(plan CallPlan) *run.Plan {
	return &run.Plan{
		Primitives: slices.Clone(plan.Primitives),
		Granted:    slices.Clone(plan.Granted),
		Withheld:   slices.Clone(plan.Withheld),
	}
}
