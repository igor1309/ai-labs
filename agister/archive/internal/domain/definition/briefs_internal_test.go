package definition

import (
	"fmt"
	"strings"
	"testing"
	"unsafe"
)

// A section's body is reserved once at its complete size, then written
// without growing its buffer or copying its input lines first, for one line
// or 10000. Process-wide allocation counts include unrelated goroutines;
// observing the product's writes and buffer seam keeps this assertion
// independent of their allocations, without a tolerance.
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
				inputLines := strings.Split(text, "\n")[2 : 2+lines]
				for i, line := range inputLines {
					inputLines[i] = strings.TrimRight(line, " \t\r")
				}
				type reservation struct {
					body           *sectionBodySpy
					size, capacity int
				}
				var reserved []reservation
				newBody := func(size int) sectionBody {
					body := &sectionBodySpy{sectionBody: newSectionBody(size)}
					// Observe the real reserved buffer as well as the writes to it.
					buffer := body.sectionBody.(*strings.Builder)
					reserved = append(reserved, reservation{body: body, size: size, capacity: buffer.Cap()})
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
				buffer := r.body.sectionBody.(*strings.Builder)
				if buffer.Cap() != r.capacity {
					t.Fatalf("body buffer grew from %d to %d while writing its lines", r.capacity, buffer.Cap())
				}
				if r.body.String() != want {
					t.Fatal("the section's lines were not written into its reserved buffer")
				}
				if len(r.body.writes) != 2*lines {
					t.Fatalf("got %d body writes, want one input line and one newline for each of %d lines", len(r.body.writes), lines)
				}
				for i, line := range inputLines {
					write, newline := r.body.writes[2*i], r.body.writes[2*i+1]
					// Equal text could be a per-line copy; require the input's backing bytes.
					if write.isByte || write.text != line || unsafe.StringData(write.text) != unsafe.StringData(line) {
						t.Fatalf("line %d was not written directly from the normalized input", i)
					}
					if !newline.isByte || newline.byte != '\n' {
						t.Fatalf("line %d was not followed by a separate newline write", i)
					}
				}
			})
		}
	}
}

type sectionBodyWrite struct {
	text   string
	byte   byte
	isByte bool
}

// sectionBodySpy records writes while forwarding them to the given buffer.
type sectionBodySpy struct {
	sectionBody
	writes []sectionBodyWrite
}

func (s *sectionBodySpy) WriteString(text string) (int, error) {
	s.writes = append(s.writes, sectionBodyWrite{text: text})
	return s.sectionBody.WriteString(text)
}

func (s *sectionBodySpy) WriteByte(b byte) error {
	s.writes = append(s.writes, sectionBodyWrite{byte: b, isByte: true})
	return s.sectionBody.WriteByte(b)
}
