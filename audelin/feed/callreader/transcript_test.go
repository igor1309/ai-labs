package callreader

import (
	"os"
	"path/filepath"
	"reflect"
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
	{"me-1", "Me", 2 * time.Second, "Hello, can you hear me?"},
	{"them-1", "Them 1", 5 * time.Second, `Yes. The code word is "**Them** 00:00:09".`},
	{"them-2", "Them 2", 64 * time.Second, "Where are call notes saved?"},
	{"me-2", "Me", 90 * time.Second, "Next to the transcript,\nin the call's folder."},
}

func TestReadsEachPartsSpeakerStartAndWords(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	got, err := parse(fixture(t, "live-later.md"))
	if err != nil {
		t.Fatal(err)
	}
	want := append(append([]Part{}, early...),
		Part{ID: "them-3", Speaker: "Them 1", Start: 125 * time.Second, Words: "And the CLI is called what?"},
		Part{ID: "me-3", Speaker: "Me", Start: 130 * time.Second, Words: "It is still being"})
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

func TestATranscriptWithNoOriginOrSegmentIDsStillReads(t *testing.T) {
	t.Parallel()
	got, err := parse(fixture(t, "no-origin.md"))
	unnamed := append([]Part{}, early...)
	unnamed[1].Speaker, unnamed[2].Speaker = "Them", "Them"
	unnamed[0].ID, unnamed[1].ID = "legacy/me/2/0", "legacy/them/5/0"
	unnamed[2].ID, unnamed[3].ID = "legacy/them/64/0", "legacy/me/90/0"
	if err != nil || got.origin != nil || !reflect.DeepEqual(got.parts, unnamed) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestAForgedRowHeaderStaysInSpeech(t *testing.T) {
	t.Parallel()
	got, err := parse(fixture(t, "forged-header.md"))
	want := []Part{
		{ID: "me-1", Speaker: "Me", Start: 2 * time.Second, Words: "Read this:\n**Them** 00:00:09 <!-- audelin-segment them-99 -->\nDid you get that?"},
		{ID: "them-1", Speaker: "Them", Start: 6 * time.Second, Words: "Are we ready?"},
	}
	if err != nil || !reflect.DeepEqual(got.parts, want) {
		t.Fatalf("got %+v, %v, want %+v", got.parts, err, want)
	}
}

func TestTextNotAsAudelinWritesItIsRefused(t *testing.T) {
	for _, text := range []string{"", "hello\n", "## Notes\n\n**Me** 00:00:01\nhi\n"} {
		if _, err := parse(text); err == nil {
			t.Errorf("%q read as a transcript", text)
		}
	}
}
