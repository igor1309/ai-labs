package fsdefs

import (
	"maps"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// A caller that changes the extensions it was given does not change the
// next call's.
func TestExtensionsReturnsANewMapEachCall(t *testing.T) {
	t.Parallel()
	want := extensions()
	changed := extensions()
	changed[definition.KindAgent] = ".yaml"
	changed["other"] = ".txt"
	delete(changed, definition.KindBlocks)
	if got := extensions(); !maps.Equal(got, want) {
		t.Fatalf("extensions() after a caller changed its map = %v, want %v", got, want)
	}
}
