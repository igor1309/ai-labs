package constraint_test

import (
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/constraint"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

func TestModelFamily(t *testing.T) {
	rule := definition.Constraint{Subject: definition.ModelFamilySubject, OnUnknown: "fail"}
	if r := constraint.ModelFamily(rule, "a", "sha", nil); r.Satisfied || !r.Unknown {
		t.Fatalf("unknown provenance is never satisfaction by default: %+v", r)
	}
	rule.OnUnknown = "pass"
	if r := constraint.ModelFamily(rule, "a", "sha", nil); !r.Satisfied || !r.Unknown {
		t.Fatalf("on_unknown pass: %+v", r)
	}
	if r := constraint.ModelFamily(rule, "a", "sha", &constraint.Writer{ModelFamily: "a"}); r.Satisfied || r.Unknown {
		t.Fatalf("same family: %+v", r)
	}
	if r := constraint.ModelFamily(rule, "a", "sha", &constraint.Writer{ModelFamily: "b"}); !r.Satisfied {
		t.Fatalf("different family: %+v", r)
	}
}
