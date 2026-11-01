package cli

import (
	"reflect"
	"testing"
)

// A flag reaches a command only when the command takes it; the global ones
// reach every command, and every flag still parses on every command.
func TestParseGivesACommandOnlyItsFlags(t *testing.T) {
	t.Parallel()
	opts, positionals, err := parse([]string{"runs", "list", "--json", "--after", "3", "--param", "a=b", "--home", "h"})
	if err != nil || opts.json || opts.after != 0 || len(opts.params) != 0 || opts.home != "h" || !reflect.DeepEqual(positionals, []string{"runs", "list"}) {
		t.Errorf("runs list: %+v %v %v", opts, positionals, err)
	}
	opts, positionals, err = parse([]string{"runs", "watch", "r", "--json", "--after", "3", "--quiet"})
	if err != nil || !opts.json || opts.after != 3 || !opts.quiet || !reflect.DeepEqual(positionals, []string{"runs", "watch", "r"}) {
		t.Errorf("runs watch: %+v %v %v", opts, positionals, err)
	}
}
