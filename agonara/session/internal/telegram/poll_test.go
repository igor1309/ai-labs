package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	onSave  func(State)
}

func (s *pollStore) Load() (State, error) { return s.state, nil }
func (s *pollStore) Save(v State) error {
	s.saves = append(s.saves, v)
	if s.onSave != nil {
		s.onSave(v)
	}
	return s.saveErr
}
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

func TestPollerAdvancesSuccessfulUpdatesAcrossBatchesAndIgnoresPriorUpdates(t *testing.T) {
	t.Parallel()
	store := &pollStore{state: State{Offset: 5, Revision: 20}}
	var offsets []int64
	var inputs []State
	var handled []int64
	api := pollAPI(func(_ context.Context, method string, params map[string]any) (json.RawMessage, error) {
		if method != "getUpdates" {
			t.Fatalf("method %s", method)
		}
		offsets = append(offsets, params["offset"].(int64))
		switch len(offsets) {
		case 1:
			return json.RawMessage(`[{"update_id":4},{"update_id":5},{"update_id":8}]`), nil
		case 2:
			return json.RawMessage(`[{"update_id":8},{"update_id":9},{"update_id":12}]`), nil
		default:
			return nil, &Error{Code: 409}
		}
	})
	handler := pollHandler(func(_ context.Context, u Update, state State) (State, error) {
		inputs = append(inputs, state)
		handled = append(handled, u.UpdateID)
		state.Revision++
		return state, nil
	})
	p, err := NewPoller(api, handler, store, func(context.Context, time.Duration) error { t.Error("unexpected retry"); return nil }, func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	var conflict *Error
	if err := p.Run(context.Background()); !errors.As(err, &conflict) || conflict.Code != 409 {
		t.Fatalf("%v", err)
	}
	if !reflect.DeepEqual(offsets, []int64{5, 9, 13}) || !reflect.DeepEqual(handled, []int64{5, 8, 9, 12}) ||
		!reflect.DeepEqual(inputs, []State{{Offset: 5, Revision: 20}, {Offset: 6, Revision: 21}, {Offset: 9, Revision: 22}, {Offset: 10, Revision: 23}}) ||
		!reflect.DeepEqual(store.saves, []State{{Offset: 6, Revision: 21}, {Offset: 9, Revision: 22}, {Offset: 10, Revision: 23}, {Offset: 13, Revision: 24}}) {
		t.Fatalf("offsets=%v handled=%v inputs=%+v saves=%+v", offsets, handled, inputs, store.saves)
	}
}

func TestPollerRetriesFailedHandlingFromLastCommittedState(t *testing.T) {
	t.Parallel()
	for _, failedID := range []int64{5, 8, 9} {
		t.Run(fmt.Sprint(failedID), func(t *testing.T) {
			t.Parallel()
			failure := errors.New("delivery failed")
			initial := State{Offset: 5, Revision: 20}
			store := &pollStore{state: initial}
			var calls []string
			store.onSave = func(s State) { calls = append(calls, fmt.Sprintf("save:%d:%d", s.Offset, s.Revision)) }
			ids := []int64{5, 8, 9}
			committed := initial
			var prefix []State
			var want []string
			want = append(want, "poll:5")
			for _, id := range ids {
				want = append(want, fmt.Sprintf("handle:%d:%d:%d", id, committed.Offset, committed.Revision))
				if id == failedID {
					break
				}
				committed = State{Offset: id + 1, Revision: committed.Revision + 1}
				prefix = append(prefix, committed)
				want = append(want, fmt.Sprintf("save:%d:%d", committed.Offset, committed.Revision))
			}
			want = append(want, "log:ERROR: delivery failed", "wait", fmt.Sprintf("poll:%d", committed.Offset))
			final := committed
			expectedSaves := append([]State(nil), prefix...)
			for _, id := range ids {
				if id < failedID {
					continue
				}
				want = append(want, fmt.Sprintf("handle:%d:%d:%d", id, final.Offset, final.Revision))
				final = State{Offset: id + 1, Revision: final.Revision + 1}
				expectedSaves = append(expectedSaves, final)
				want = append(want, fmt.Sprintf("save:%d:%d", final.Offset, final.Revision))
			}
			want = append(want, "poll:10")
			polls, waits := 0, 0
			api := pollAPI(func(_ context.Context, method string, params map[string]any) (json.RawMessage, error) {
				polls++
				expectedOffset := initial.Offset
				if polls == 2 {
					expectedOffset = committed.Offset
				}
				if polls == 3 {
					expectedOffset = final.Offset
				}
				if polls > 3 || method != "getUpdates" || !reflect.DeepEqual(params, map[string]any{"offset": expectedOffset, "timeout": 25, "allowed_updates": []string{"message", "callback_query"}}) {
					t.Fatalf("poll %d %s %+v", polls, method, params)
				}
				calls = append(calls, fmt.Sprintf("poll:%d", expectedOffset))
				if polls == 3 {
					return nil, &Error{Code: 409}
				}
				return json.RawMessage(`[{"update_id":4},{"update_id":5},{"update_id":8},{"update_id":9}]`), nil
			})
			handler := pollHandler(func(_ context.Context, u Update, s State) (State, error) {
				if !reflect.DeepEqual(u, Update{UpdateID: u.UpdateID}) {
					t.Fatalf("update %+v", u)
				}
				calls = append(calls, fmt.Sprintf("handle:%d:%d:%d", u.UpdateID, s.Offset, s.Revision))
				if polls == 1 && u.UpdateID == failedID {
					return State{Offset: 999, Revision: 999}, failure
				}
				s.Revision++
				return s, nil
			})
			var poller *Poller
			wait := func(_ context.Context, d time.Duration) error {
				waits++
				calls = append(calls, "wait")
				if waits != 1 || d != 5*time.Second || poller.state != committed || !reflect.DeepEqual(store.saves, prefix) {
					t.Fatalf("failed update committed: waits=%d duration=%v state=%+v saves=%+v", waits, d, poller.state, store.saves)
				}
				return nil
			}
			var err error
			poller, err = NewPoller(api, handler, store, wait, func(s string) { calls = append(calls, "log:"+s) })
			if err != nil {
				t.Fatal(err)
			}
			var conflict *Error
			if err = poller.Run(context.Background()); !errors.As(err, &conflict) || conflict.Code != 409 {
				t.Fatalf("run: %v", err)
			}
			if waits != 1 || poller.state != final || !reflect.DeepEqual(store.saves, expectedSaves) || !reflect.DeepEqual(calls, want) {
				t.Fatalf("state=%+v saves=%+v calls=%v want=%v", poller.state, store.saves, calls, want)
			}
		})
	}
}
