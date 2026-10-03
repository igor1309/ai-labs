package app

import (
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// A caller that changes the kinds it was given does not change the next
// call's, nor their order.
func TestAllKindsReturnsANewSliceEachCall(t *testing.T) {
	t.Parallel()
	want := allKinds()
	changed := allKinds()
	changed[0] = definition.KindBlocks
	slices.Reverse(changed)
	if got := allKinds(); !slices.Equal(got, want) {
		t.Fatalf("allKinds() after a caller changed its slice = %v, want %v", got, want)
	}
}
