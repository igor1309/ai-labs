package cli

import (
	"flag"
	"regexp"
	"strings"
	"testing"
)

// The help stays current: every flag the parser accepts is described.
func TestUsageDescribesEveryFlag(t *testing.T) {
	t.Parallel()
	opts := options{params: paramFlag{}}
	flags(func(string) *options { return &opts }).VisitAll(func(f *flag.Flag) {
		spelled := "--" + f.Name
		if len(f.Name) == 1 {
			spelled = "-" + f.Name
		}
		// A whole flag: -h inside --home does not count.
		if !regexp.MustCompile(`(^|[^\w-])` + regexp.QuoteMeta(spelled) + `([^\w-]|$)`).MatchString(usage) {
			t.Errorf("usage does not mention %s", spelled)
		}
	})
}

// The help describes the join as ADR-004 does: once every fan-out node
// ended, if at least one completed.
func TestUsageDescribesTheJoin(t *testing.T) {
	t.Parallel()
	want := "fan-out nodes run concurrently, the join once all of them ended, if at least one completed;"
	if !strings.Contains(strings.Join(strings.Fields(usage), " "), want) {
		t.Errorf("usage does not say %q", want)
	}
}
