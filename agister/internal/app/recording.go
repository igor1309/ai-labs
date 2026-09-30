package app

import (
	"slices"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The run record owns its types (see run.DefinitionSource); these translate
// what a call resolved into them.

func recordSources(sources []definition.Source) []run.DefinitionSource {
	if sources == nil {
		return nil
	}
	recorded := make([]run.DefinitionSource, len(sources))
	for i, source := range sources {
		recorded[i] = run.DefinitionSource{
			Kind:      string(source.Kind),
			Name:      source.Name,
			Path:      source.Path,
			SHA256:    source.SHA256,
			Project:   source.Project,
			Overrides: source.Overrides,
		}
	}
	return recorded
}

func recordEffective(effective policy.Effective) *run.EffectivePolicy {
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
	}
}

func recordPlan(plan enforce.Plan) *run.Plan {
	return &run.Plan{
		Primitives: slices.Clone(plan.Primitives),
		Granted:    slices.Clone(plan.Granted),
		Withheld:   slices.Clone(plan.Withheld),
	}
}
