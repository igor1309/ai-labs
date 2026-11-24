package callreader

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
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
	{"1", "Me", 2 * time.Second, "Hello, can you hear me?"},
	{"2", "Them 1", 5 * time.Second, `Yes. The code word is "**Them** 00:00:09".`},
	{"3", "Them 2", 64 * time.Second, "Where are call notes saved?"},
	{"4", "Me", 90 * time.Second, "Next to the transcript,\nin the call's folder."},
}

func withoutIDs(parts []Part) []Part {
	parts = slices.Clone(parts)
	for i := range parts {
		parts[i].ID = ""
	}
	return parts
}

func TestReadsEachPartsSpeakerStartAndWords(t *testing.T) {
	got, err := parse(fixture(t, "live.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.parts, withoutIDs(early)) {
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
	want := append(withoutIDs(early),
		Part{Speaker: "Them 1", Start: 125 * time.Second, Words: "And the CLI is called what?"},
		Part{Speaker: "Me", Start: 130 * time.Second, Words: "It is still being"})
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
	unnamed := withoutIDs(early)
	unnamed[1].Speaker, unnamed[2].Speaker = "Them", "Them"
	if err != nil || got.origin != nil || !reflect.DeepEqual(got.parts, unnamed) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestTextNotAsAudelinWritesItIsRefused(t *testing.T) {
	for _, text := range []string{"", "hello\n", "## Notes\n\n**Me** 00:00:01\nhi\n"} {
		if _, err := parse(text); err == nil {
			t.Errorf("%q read as a transcript", text)
		}
	}
}
