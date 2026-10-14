package document_test

import (
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

func TestValidNameKeepsTheExistingAcceptedNames(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name string
		want bool
	}{
		{"a", true},
		{"z", true},
		{"az09_-", true},
		{"a-b_c", true},
		{"a-", true},
		{"a_", true},
		{"", false},
		{"0a", false},
		{"-a", false},
		{"_a", false},
		{"A", false},
		{"aZ", false},
		{"`", false},
		{"{", false},
		{"a/", false},
		{"a\\b", false},
		{".a", false},
		{"a.b", false},
		{"a b", false},
		{" a", false},
		{"a\n", false},
		{"é", false},
		{"aé", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := document.ValidName(c.name); got != c.want {
				t.Errorf("ValidName(%q) = %v, want %v", c.name, got, c.want)
			}
		})
	}
}
