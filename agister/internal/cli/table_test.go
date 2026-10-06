package cli

import (
	"flag"
	"reflect"
	"testing"
)

// parserFlags is the FlagSet parse uses, with every option bound to one
// throwaway options.
func parserFlags() *flag.FlagSet {
	opts := options{params: paramFlag{}}
	return flags(func(string) *options { return &opts })
}

// unregistered names each flag of the command table and of the global flags
// that set does not register, as "<command>: --<flag>" ("global" for a
// global flag).
func unregistered(set *flag.FlagSet, table []Command, global []string) []string {
	var missing []string
	for _, name := range global {
		if set.Lookup(name) == nil {
			missing = append(missing, "global: --"+name)
		}
	}
	for _, command := range table {
		for _, name := range command.Flags {
			if set.Lookup(name) == nil {
				missing = append(missing, command.Name+": --"+name)
			}
		}
	}
	return missing
}

// The command table and the global flags name only flags the parser
// registers (D-17).
func TestTableNamesOnlyRegisteredFlags(t *testing.T) {
	t.Parallel()
	if missing := unregistered(parserFlags(), Commands(), GlobalFlags()); len(missing) > 0 {
		t.Errorf("the table names flags the parser does not register: %v", missing)
	}
}

// The check reports a flag of a command, or a global one, that the parser
// does not register, and no registered one.
func TestUnregisteredReportsAFlagTheParserLacks(t *testing.T) {
	t.Parallel()
	table := []Command{
		{"run", []string{"param", "max-costs"}},
		{"runs list", nil},
		{"init", []string{"force"}},
	}
	got := unregistered(parserFlags(), table, []string{"home", "verbose"})
	want := []string{"global: --verbose", "run: --max-costs"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}
