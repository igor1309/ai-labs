package app_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// numbered is the lines from first to last, each its number, but for those
// replaced.
func numbered(first, last int, replaced map[int]string) string {
	var b strings.Builder
	for n := first; n <= last; n++ {
		if line, ok := replaced[n]; ok {
			b.WriteString(line + "\n")
		} else {
			fmt.Fprintf(&b, "%d\n", n)
		}
	}
	return b.String()
}

// A diff shows each change with three lines of context, in one hunk when
// the context of two changes would meet, and says where a side has no
// final newline.
func TestUnifiedDiff(t *testing.T) {
	// Too many lines to compare: one line in common, but the whole is
	// shown removed, then added.
	var before, after, fallback strings.Builder
	fallback.WriteString("--- a\n+++ b\n@@ -1,1025 +1,1025 @@\n")
	for n := range 1024 {
		fmt.Fprintf(&before, "a%d\n", n)
		fmt.Fprintf(&fallback, "-a%d\n", n)
	}
	before.WriteString("same\n")
	after.WriteString("same\n")
	fallback.WriteString("-same\n+same\n")
	for n := range 1024 {
		fmt.Fprintf(&after, "b%d\n", n)
		fmt.Fprintf(&fallback, "+b%d\n", n)
	}
	for _, test := range []struct {
		name, a, b, want string
	}{
		{"joined", numbered(1, 10, nil), numbered(1, 10, map[int]string{2: "two", 8: "eight"}),
			"--- a\n+++ b\n@@ -1,10 +1,10 @@\n 1\n-2\n+two\n 3\n 4\n 5\n 6\n 7\n-8\n+eight\n 9\n 10\n"},
		{"split", numbered(1, 20, nil), numbered(1, 20, map[int]string{2: "two", 15: "fifteen"}),
			"--- a\n+++ b\n@@ -1,5 +1,5 @@\n 1\n-2\n+two\n 3\n 4\n 5\n@@ -12,7 +12,7 @@\n 12\n 13\n 14\n-15\n+fifteen\n 16\n 17\n 18\n"},
		{"no final newline", "x\ny", "x\nz",
			"--- a\n+++ b\n@@ -1,2 +1,2 @@\n x\n-y\n\\ No newline at end of file\n+z\n\\ No newline at end of file\n"},
		{"final newline added", "x", "x\n",
			"--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+x\n"},
		{"empty before", "", "new\n", "--- a\n+++ b\n@@ -0,0 +1 @@\n+new\n"},
		{"empty after", "old\n", "", "--- a\n+++ b\n@@ -1 +0,0 @@\n-old\n"},
		{"unchanged", "x\n", "x\n", "--- a\n+++ b\n"},
		{"too large to compare", before.String(), after.String(), fallback.String()},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := app.UnifiedDiff("a", "b", []byte(test.a), []byte(test.b)); got != test.want {
				t.Fatalf("got\n%s\nwant\n%s", got, test.want)
			}
		})
	}
}
