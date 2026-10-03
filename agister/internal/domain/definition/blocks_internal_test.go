package definition

import (
	"maps"
	"testing"
)

// A caller that changes the blockable kinds it was given does not change
// the next call's.
func TestBlockableReturnsANewMapEachCall(t *testing.T) {
	t.Parallel()
	want := blockable()
	changed := blockable()
	changed["process"] = KindAgent
	changed["service"] = KindService
	delete(changed, "runtime")
	if got := blockable(); !maps.Equal(got, want) {
		t.Fatalf("blockable() after a caller changed its map = %v, want %v", got, want)
	}
}
