package definition

import (
	"maps"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// A caller that changes the blockable kinds it was given does not change
// the next call's.
func TestBlockableReturnsANewMapEachCall(t *testing.T) {
	t.Parallel()
	want := blockable()
	changed := blockable()
	changed["process"] = document.KindAgent
	changed["service"] = document.KindService
	delete(changed, "runtime")
	if got := blockable(); !maps.Equal(got, want) {
		t.Fatalf("blockable() after a caller changed its map = %v, want %v", got, want)
	}
}
