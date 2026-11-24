package callevents_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func TestS13_NewWordsCanBeToldFromTheOverlap(t *testing.T) {
	before := part("me", 30*time.Second, "before")
	inOverlap := part("them", 2*time.Minute+30*time.Second, "question?")
	after := part("me", 4*time.Minute, "answer")
	e, _ := newEvents(t, heard(before, inOverlap, after), 3*time.Minute, time.Minute)
	next(t, e)

	w := next(t, e).Window

	want := callevents.Window{From: 2 * time.Minute, To: 5 * time.Minute,
		Context: []callevents.Part{inOverlap}, New: []callevents.Part{after}}
	if !reflect.DeepEqual(w, want) {
		t.Fatalf("got %+v, want %+v", w, want)
	}
}

func TestS14_AnOverlapAloneReadsAsNoNewWords(t *testing.T) {
	inOverlap := part("them", 2*time.Minute+30*time.Second, "last words")
	e, _ := newEvents(t, heard(inOverlap), 3*time.Minute, time.Minute)
	next(t, e)

	w := next(t, e).Window

	if len(w.New) != 0 || !reflect.DeepEqual(w.Context, []callevents.Part{inOverlap}) {
		t.Fatalf("got %+v, want the overlap as context and no new words", w)
	}
}

func TestS13_OverlapRepeatsEmittedWordsAfterRevisionAndRelabeling(t *testing.T) {
	t.Parallel()
	outside := part("Them", 30*time.Second, "outside")
	inside := part("Them", 150*time.Second, "inside")
	sameSecond := inside
	sameSecond.ID += "/2"
	sameSecond.Words = "also inside"
	fresh := part("Them 2", 230*time.Second, "new speaker")
	at := func(now time.Duration) (callevents.Call, bool, error) {
		call := callevents.Call{ID: "call", Start: zero}
		switch {
		case now == 3*time.Minute:
			call.Parts = []callevents.Part{outside, inside, sameSecond}
		case now > 3*time.Minute:
			outsideRevision, insideRevision := outside, inside
			outsideRevision.Side, outsideRevision.Words = "Them 1", "outside revised"
			insideRevision.Side, insideRevision.Words = "Them 1", "inside revised"
			call.Parts = []callevents.Part{outsideRevision, insideRevision, fresh}
		}
		return call, true, nil
	}
	e, c := newEvents(t, at, 3*time.Minute, time.Minute)

	if got, want := next(t, e), chunk(0, 3*time.Minute, nil, []callevents.Part{outside, inside, sameSecond}); !reflect.DeepEqual(got, want) {
		t.Fatalf("first window %+v, want %+v", got, want)
	}
	c.now = zero.Add(5 * time.Minute)
	if got, want := next(t, e), chunk(2*time.Minute, 5*time.Minute, []callevents.Part{inside, sameSecond}, []callevents.Part{fresh}); !reflect.DeepEqual(got, want) {
		t.Fatalf("second window %+v, want %+v", got, want)
	}
}
