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
			Kind: source.Kind,
			Name: source.Name,
			Layers: translated(source.Layers, func(layer CallSourceLayer) run.DefinitionLayer {
				return run.DefinitionLayer{Layer: layer.Layer, Path: layer.Path, SHA256: layer.SHA256, Fields: layer.Fields, Process: layer.Process}
			}),
		}
	}
	return recorded
}

func recordLayers(layers []CallLayer) []run.Layer {
	return translated(layers, func(layer CallLayer) run.Layer {
		return run.Layer{Layer: layer.Layer, Dir: layer.Dir}
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
		if recover := effective.Stale.Recover; recover != (CallRecover{}) {
			stale.Recover = &run.StaleRecover{MaxResumes: recover.MaxResumes, Instruction: recover.Instruction}
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
	recorded := &run.Verify{
		Command:     verify.Command,
		Timeout:     verify.Timeout,
		MaxAttempts: verify.MaxAttempts,
		Instruction: verify.Instruction,
		// It runs in the call's worktree (ADR-025 rule 5).
		Where: run.VerifyInWorkspace,
	}
	return recorded
}

func recordPlan(plan CallPlan) *run.Plan {
	return &run.Plan{
		Primitives: slices.Clone(plan.Primitives),
		Granted:    slices.Clone(plan.Granted),
		Withheld:   slices.Clone(plan.Withheld),
		Declared:   append([]string{}, plan.Declared...),
		Extra:      append([]string{}, plan.Extra...),
	}
}
