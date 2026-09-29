package cli

import (
	"flag"
	"regexp"
	"testing"
)

// The help stays current: every flag the parser accepts is described.
func TestUsageDescribesEveryFlag(t *testing.T) {
	opts := options{params: paramFlag{}}
	flags(&opts).VisitAll(func(f *flag.Flag) {
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
