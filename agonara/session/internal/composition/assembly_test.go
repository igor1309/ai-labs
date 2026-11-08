package composition

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
	"github.com/igor1309/ai-labs/agonara/session/internal/web"
)

type transportSpy struct {
	state telegram.State
	err   error
	loads int
}

func (s *transportSpy) Load() (telegram.State, error) { s.loads++; return s.state, s.err }
func (s *transportSpy) Save(v telegram.State) error   { s.state = v; return nil }

func TestAssemblyRefusesAuthenticationOrTransportFailureBeforePublishingHandler(t *testing.T) {
	t.Parallel()
	for _, failure := range []string{"auth", "storage", "negative offset", "negative revision"} {
		t.Run(failure, func(t *testing.T) {
			t.Parallel()
			injected := errors.New("transport unreadable")
			api := &messageAPI{}
			transport := &transportSpy{}
			var want error
			switch failure {
			case "auth":
				want = &telegram.Error{Method: "getMe", Code: 401}
				api.err = want
			case "storage":
				want = injected
				transport.err = want
			case "negative offset":
				transport.state.Offset = -1
			case "negative revision":
				transport.state.Revision = -1
			}
			assembled, err := Assemble(context.Background(), Config{PageSize: 1000, WebToken: "access", ChatID: 1}, false, Dependencies{
				Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, API: api, Transport: transport,
				Wait: func(context.Context, time.Duration) error { t.Fatal("initialization waited"); return nil }, Log: func(string) {},
			})
			if err == nil || assembled != nil || want != nil && !errors.Is(err, want) {
				t.Fatalf("published readiness after %s: %+v %v", failure, assembled, err)
			}
			wantLoads := 1
			if failure == "auth" {
				wantLoads = 0
			}
			if !reflect.DeepEqual(api.methods, []string{"getMe"}) || api.params[0] != nil || transport.loads != wantLoads {
				t.Fatalf("initialization calls: %v %v loads=%d", api.methods, api.params, transport.loads)
			}
		})
	}
}

// Integration test: production assembly with isolated reading and transport spies.
func TestStandaloneAssemblyUsesItsOwnStateAndNoTelegramInfrastructure(t *testing.T) {
	t.Parallel()
	config := Config{PageSize: 1000, WebToken: "access", ChatID: 1}
	shared, isolated := &memoryStorage{state: flow.InitialState()}, &memoryStorage{state: flow.InitialState()}
	api, transport := &messageAPI{}, &transportSpy{}
	normal, err := Assemble(context.Background(), config, false, Dependencies{Content: readingSpy{}, Reading: shared, API: api, Transport: transport, Wait: func(context.Context, time.Duration) error { return nil }, Log: func(string) {}})
	if err != nil {
		t.Fatal(err)
	}
	standalone, err := Assemble(context.Background(), config, true, Dependencies{Content: readingSpy{}, Reading: isolated, Log: func(string) {}})
	if err != nil {
		t.Fatal(err)
	}
	if standalone.Bot != nil || standalone.Poller != nil || standalone.Telegram.Session != nil {
		t.Fatal("standalone owns Telegram")
	}
	for _, a := range []*Assembly{normal, standalone} {
		w := httptest.NewRecorder()
		a.Handler.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		if w.Code != http.StatusUnauthorized || w.Header().Get("X-Agonara-Session") != "shared" {
			t.Fatalf("guard/readiness: %d %v", w.Code, w.Header())
		}
	}
	if _, err := normal.Web.Open(context.Background(), web.Request{Route: "entity", ID: "m", Page: number(2)}); err != nil {
		t.Fatal(err)
	}
	if shared.state.Current.EntityID != "m" || isolated.state.Current.Screen != "programs" {
		t.Fatalf("normal changed isolated state: %+v", isolated.state)
	}
	if _, err := standalone.Web.Open(context.Background(), web.Request{Route: "entity", ID: "m", Page: number(1)}); err != nil {
		t.Fatal(err)
	}
	if *shared.state.Current.Page != 2 || *isolated.state.Current.Page != 1 || transport.loads != 1 || !reflect.DeepEqual(api.methods, []string{"getMe"}) {
		t.Fatalf("isolation: %+v %+v calls=%v loads=%d", shared.state, isolated.state, api.methods, transport.loads)
	}
}

func TestAssemblyRejectsMissingCollaborators(t *testing.T) {
	t.Parallel()
	for _, missing := range []string{"content", "reading", "api", "transport", "wait", "log"} {
		t.Run(missing, func(t *testing.T) {
			t.Parallel()
			d := Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, API: &messageAPI{}, Transport: &transportSpy{}, Wait: func(context.Context, time.Duration) error { return nil }, Log: func(string) {}}
			switch missing {
			case "content":
				d.Content = nil
			case "reading":
				d.Reading = nil
			case "api":
				d.API = nil
			case "transport":
				d.Transport = nil
			case "wait":
				d.Wait = nil
			case "log":
				d.Log = nil
			}
			if a, err := Assemble(context.Background(), Config{PageSize: 1000, WebToken: "access", ChatID: 1}, false, d); err == nil || a != nil {
				t.Fatalf("missing %s accepted", missing)
			}
		})
	}
}
