package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"
)

type pollAPI func(context.Context, string, map[string]any) (json.RawMessage, error)

func (a pollAPI) Call(c context.Context, m string, p map[string]any) (json.RawMessage, error) {
	return a(c, m, p)
}

type pollHandler func(context.Context, Update, State) (State, error)

func (h pollHandler) Handle(c context.Context, u Update, s State) (State, error) { return h(c, u, s) }

type pollStore struct {
	state   State
	saveErr error
	saves   []State
}

func (s *pollStore) Load() (State, error) { return s.state, nil }
func (s *pollStore) Save(v State) error   { s.saves = append(s.saves, v); return s.saveErr }
func TestPollerCommitsOffsetAfterHandlingAndStopsOnStorageError(t *testing.T) {
	t.Parallel()
	failure := errors.New("storage failed")
	store := &pollStore{state: State{Offset: 5}, saveErr: failure}
	calls := 0
	api := pollAPI(func(_ context.Context, m string, p map[string]any) (json.RawMessage, error) {
		calls++
		if m != "getUpdates" || p["offset"] != int64(5) {
			t.Fatalf("%s %+v", m, p)
		}
		return json.RawMessage(`[{"update_id":4},{"update_id":5}]`), nil
	})
	handler := pollHandler(func(_ context.Context, u Update, s State) (State, error) {
		if u.UpdateID != 5 || s.Offset != 5 {
			t.Fatalf("%+v %+v", u, s)
		}
		s.Revision = 9
		return s, nil
	})
	wait := func(context.Context, time.Duration) error { t.Fatal("wait after storage failure"); return nil }
	p, err := NewPoller(api, handler, store, wait, func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	if err = p.Run(context.Background()); !errors.Is(err, failure) || calls != 1 || !reflect.DeepEqual(store.saves, []State{{Offset: 6, Revision: 9}}) {
		t.Fatalf("%v calls=%d saves=%+v", err, calls, store.saves)
	}
}
func TestPollerRetriesThroughInjectedWaitAndExitsOnConflict(t *testing.T) {
	t.Parallel()
	calls, waits := 0, 0
	api := pollAPI(func(context.Context, string, map[string]any) (json.RawMessage, error) {
		calls++
		if calls == 1 {
			return nil, errors.New("network")
		}
		return nil, &Error{Code: 409}
	})
	wait := func(_ context.Context, d time.Duration) error {
		waits++
		if d != 5*time.Second {
			t.Fatal(d)
		}
		return nil
	}
	p, err := NewPoller(api, pollHandler(func(_ context.Context, _ Update, s State) (State, error) { return s, nil }), &pollStore{}, wait, func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	var conflict *Error
	if err = p.Run(context.Background()); !errors.As(err, &conflict) || waits != 1 || calls != 2 {
		t.Fatalf("%v waits=%d calls=%d", err, waits, calls)
	}
}
func TestBotSubmitsDisplayedRevisionAndHonorsSharedStaleness(t *testing.T) {
	t.Parallel()
	api := &fakeAPI{}
	calls := 0
	session := sessionSpy(func(_ context.Context, q Request) (*Result, error) {
		calls++
		if q.Action != "next" || q.Revision == nil || *q.Revision != 3 {
			t.Fatalf("%+v", q)
		}
		return nil, ErrStale
	})
	state := State{Revision: 3}
	got := handle(t, api, press("3:next", chat), state, session, nil)
	if got != state || calls != 1 || len(api.calls) != 1 || api.calls[0].method != "answerCallbackQuery" {
		t.Fatalf("%+v %+v", got, api.calls)
	}
}

func TestConstructionRejectsMissingTransportCollaborators(t *testing.T) {
	t.Parallel()
	api := pollAPI(func(context.Context, string, map[string]any) (json.RawMessage, error) { return nil, nil })
	handler := pollHandler(func(_ context.Context, _ Update, s State) (State, error) { return s, nil })
	wait := func(context.Context, time.Duration) error { return nil }
	log := func(string) {}
	for _, makePoller := range []func() (*Poller, error){
		func() (*Poller, error) { return NewPoller(nil, handler, &pollStore{}, wait, log) },
		func() (*Poller, error) { return NewPoller(api, nil, &pollStore{}, wait, log) },
		func() (*Poller, error) { return NewPoller(api, handler, nil, wait, log) },
		func() (*Poller, error) { return NewPoller(api, handler, &pollStore{}, nil, log) },
		func() (*Poller, error) { return NewPoller(api, handler, &pollStore{}, wait, nil) },
	} {
		if _, err := makePoller(); err == nil {
			t.Fatal("missing poll dependency")
		}
	}
	session := sessionSpy(func(context.Context, Request) (*Result, error) { return nil, nil })
	for _, makeBot := range []func() (Bot, error){
		func() (Bot, error) { return NewBot(nil, session, 1, log) },
		func() (Bot, error) { return NewBot(api, nil, 1, log) },
		func() (Bot, error) { return NewBot(api, session, 0, log) },
		func() (Bot, error) { return NewBot(api, session, 1, nil) },
	} {
		if _, err := makeBot(); err == nil {
			t.Fatal("missing bot dependency")
		}
	}
}
