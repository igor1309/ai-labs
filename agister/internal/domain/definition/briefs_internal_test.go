package definition

import (
	"fmt"
	"strings"
	"testing"
)

// A section's body is reserved once at its complete size, then written
// without growing its buffer, for one line or 10000. Process-wide allocation
// counts include unrelated goroutines; observing the product's buffer seam
// keeps this assertion independent of their allocations, without a tolerance.
func TestALongSectionIsReadWithoutCopyingItAgainPerLine(t *testing.T) {
	t.Parallel()
	for _, lines := range []int{1, 10000} {
		for _, ending := range []string{"next heading", "end of text"} {
			t.Run(fmt.Sprintf("%d lines, %s", lines, ending), func(t *testing.T) {
				t.Parallel()
				brief := Brief{Parts: []BriefPart{{Heading: "## Covers", Required: true}}}
				text := "Preamble.\n## Covers\n" + strings.TrimSuffix(strings.Repeat("- a criterion \t\r\n", lines), "\n")
				if ending == "next heading" {
					text += "\n## Other\nOutside the section."
				}
				want := strings.Repeat("- a criterion\n", lines)
				type reservation struct {
					body           *strings.Builder
					size, capacity int
				}
				var reserved []reservation
				newBody := func(size int) *strings.Builder {
					body := newSectionBody(size)
					reserved = append(reserved, reservation{body: body, size: size, capacity: body.Cap()})
					return body
				}
				found := brief.sections(text, newBody)
				if len(found) != 1 || len(found[0]) != 1 || found[0][0].line != 1 || found[0][0].body != want {
					t.Fatal("the section does not contain exactly its normalized lines")
				}
				if len(reserved) != 1 {
					t.Fatalf("reserved %d buffers for one section, want 1", len(reserved))
				}
				r := reserved[0]
				if r.size != len(want) || r.capacity < len(want) {
					t.Fatalf("reserved size %d, capacity %d, want space for all %d bytes", r.size, r.capacity, len(want))
				}
				if r.body.Cap() != r.capacity {
					t.Fatalf("body buffer grew from %d to %d while writing its lines", r.capacity, r.body.Cap())
				}
				if r.body.String() != want {
					t.Fatal("the section's lines were not written into its reserved buffer")
				}
			})
		}
	}
}
