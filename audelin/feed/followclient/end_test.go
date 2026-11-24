package followclient_test

import (
	"errors"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/followclient"
)

func TestS4_TheCallsEndEndsFollowing(t *testing.T) {
	after := window(nil, []followclient.Part{{"Me", time.Minute, "never read"}})

	got, err := follow(t, ended, after)

	if err != nil {
		t.Fatalf("end returned %v", err)
	}
	if len(got) != 1 || got[0].Type != "call_ended" || got[0].Says == "" {
		t.Fatalf("got %+v, want only the end", got)
	}
}

func TestS6_ALostSourceEndsFollowing(t *testing.T) {
	got, err := follow(t, window(nil, nil))

	if !errors.Is(err, followclient.ErrLost) {
		t.Fatalf("err %v, want lost", err)
	}
	if len(got) != 2 || got[1].Type != "source_lost" || got[1].Says == "" {
		t.Fatalf("got %+v, want the window, then that the source was lost", got)
	}
}
