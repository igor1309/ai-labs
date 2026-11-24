package callreader

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

var early = []Part{
	{"Me", 2 * time.Second, "Hello, can you hear me?"},
	{"Them 1", 5 * time.Second, `Yes. The code word is "**Them** 00:00:09".`},
	{"Them 2", 64 * time.Second, "Where are call notes saved?"},
	{"Me", 90 * time.Second, "Next to the transcript,\nin the call's folder."},
}

func TestReadsEachPartsSpeakerStartAndWords(t *testing.T) {
	got, err := parse(fixture(t, "live.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.parts, early) {
		t.Fatalf("got %q, want %q", got.parts, early)
	}
	if got.origin == nil || len(got.origin.Calls) != 1 || got.origin.Calls[0].Origin.Hearing == nil {
		t.Fatalf("origin %+v, want one call that tells its hearing", got.origin)
	}
}

func TestReadsTheTailAsTheFileShowsIt(t *testing.T) {
	got, err := parse(fixture(t, "live-later.md"))
	if err != nil {
		t.Fatal(err)
	}
	want := append(append([]Part{}, early...),
		Part{"Them 1", 125 * time.Second, "And the CLI is called what?"},
		Part{"Me", 130 * time.Second, "It is still being"})
	if !reflect.DeepEqual(got.parts, want) {
		t.Fatalf("got %q, want %q", got.parts, want)
	}
}

func TestATranscriptWithNoTextHasNoParts(t *testing.T) {
	got, err := parse(fixture(t, "live-no-text.md"))
	if err != nil || len(got.parts) != 0 || got.origin == nil {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestATranscriptWithNoOriginStillReads(t *testing.T) {
	got, err := parse(fixture(t, "no-origin.md"))
	unnamed := []Part{early[0], {"Them", early[1].Start, early[1].Words}, {"Them", early[2].Start, early[2].Words}, early[3]}
	if err != nil || got.origin != nil || !reflect.DeepEqual(got.parts, unnamed) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestS11_AHalfWrittenLastLineIsLeftForLater(t *testing.T) {
	whole := fixture(t, "live-later.md")
	cut := strings.Index(whole, "And the CLI") + len("And the")

	half, err := parse(whole[:cut])
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(half.parts, early) {
		t.Fatalf("half-written: got %q, want the parts before it", half.parts)
	}
}

func TestTextNotAsAudelinWritesItIsRefused(t *testing.T) {
	for _, text := range []string{"", "hello\n", "## Notes\n\n**Me** 00:00:01\nhi\n"} {
		if _, err := parse(text); err == nil {
			t.Errorf("%q read as a transcript", text)
		}
	}
}
