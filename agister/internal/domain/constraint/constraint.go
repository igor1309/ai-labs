// Package constraint evaluates call constraints against provenance that
// Agister recorded itself.
package constraint

import (
	"fmt"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Writer is the recorded author of a revision Agister produced.
type Writer struct {
	Agent       string `json:"agent"`
	ModelFamily string `json:"model_family"`
	RunID       string `json:"run_id"`
}

// Result of one constraint.
type Result struct {
	Subject   string `json:"subject"`
	Satisfied bool   `json:"satisfied"`
	Unknown   bool   `json:"unknown"`
	Basis     string `json:"basis"`
}

// ModelFamily checks that agentFamily differs from the revision writer's.
// Without recorded provenance the result is unknown, and the constraint's
// own OnUnknown rule decides.
func ModelFamily(c definition.Constraint, agentFamily, revision string, writer *Writer) Result {
	if writer == nil {
		return Result{
			Subject:   c.Subject,
			Unknown:   true,
			Satisfied: c.OnUnknown == "pass",
			Basis:     fmt.Sprintf("no Agister-recorded provenance for %s; on_unknown is %s", revision, c.OnUnknown),
		}
	}
	return Result{
		Subject:   c.Subject,
		Satisfied: writer.ModelFamily != agentFamily,
		Basis:     fmt.Sprintf("agent family %s, writer family %s (run %s)", agentFamily, writer.ModelFamily, writer.RunID),
	}
}
