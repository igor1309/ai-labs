package composition

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/sessionstore"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
	"github.com/igor1309/ai-labs/agonara/session/internal/web"
)

type readingSpy struct{}

func (readingSpy) ListPrograms(context.Context) ([]flow.CatalogEntry, error) {
	return []flow.CatalogEntry{{ID: "p", Title: "Program"}}, nil
}
func (readingSpy) Navigation(context.Context, string) (flow.Navigation, error) {
	return flow.Navigation{Topics: []flow.Item{{ID: "t", Title: "Topic", Kind: "topic"}}}, nil
}
func (readingSpy) Entity(_ context.Context, id string) (flow.Entity, error) {
	e := flow.Entity{ID: id, Title: "Lecture", ProgramID: "p", Kind: "material_reference", Readable: true}
	if id == "t" {
		e.Kind = "topic"
		e.Readable = false
		e.Title = "Topic"
		e.Children = []flow.Item{{ID: "m", Title: "Lecture", Kind: "material_reference"}}
	}
	return e, nil
}
func (readingSpy) MaterialContent(context.Context, string) (string, error) {
	return "# Lecture\n\nIntro.\n\n## First\n\nFirst <text>.\n\n## Second\n\nSecond text.", nil
}

type messageAPI struct {
	methods []string
	params  []map[string]any
}

func (a *messageAPI) Call(_ context.Context, m string, p map[string]any) (json.RawMessage, error) {
	a.methods = append(a.methods, m)
	a.params = append(a.params, p)
	return nil, nil
}
func request(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("GET", path, nil)
	r.AddCookie(&http.Cookie{Name: "agonara_web", Value: "access"})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// Contract test: integrates reading, service, surface adapters, HTTP rendering and filesystem restart; Telegram is a spy.
func TestBothSurfacesResumeOneReadingSessionAfterSwitchingAndRestart(t *testing.T) {
	t.Parallel()
	activity := flow.Flow{Reader: readingSpy{}, PageSize: 1000}
	disk := sessionstore.ReadingFile{Path: filepath.Join(t.TempDir(), "reading.json")}
	service, err := flow.NewService(activity, disk)
	if err != nil {
		t.Fatal(err)
	}
	server := &web.Server{Session: Web{service}, Token: "access"}
	handler, err := server.Handler()
	if err != nil {
		t.Fatal(err)
	}
	page := request(t, handler, "/m/m?page=1")
	if page.Code != 200 || !strings.Contains(page.Body.String(), `<h1 class="heading">First</h1>`) || !strings.Contains(page.Body.String(), "First &lt;text&gt;.") {
		t.Fatalf("%d %s", page.Code, page.Body.String())
	}
	api := &messageAPI{}
	bot := telegram.Bot{API: api, Session: Telegram{service}, AllowedChatID: 1, Log: func(string) {}}
	state, err := bot.Handle(context.Background(), telegram.Update{Message: &telegram.Message{Chat: telegram.Chat{ID: 1}}}, telegram.State{})
	if err != nil || state.Revision != 2 || !strings.Contains(api.params[0]["rich_message"].(map[string]any)["html"].(string), "First &lt;text&gt;.") {
		t.Fatalf("%+v %v %+v", state, err, api.params)
	}
	// A web page move invalidates the previously displayed Telegram callback.
	page = request(t, handler, "/m/m?page=2&rev=2")
	if page.Code != 200 {
		t.Fatal(page.Code)
	}
	stale := telegram.Update{CallbackQuery: &telegram.CallbackQuery{ID: "cb", Data: "2:next", Message: &telegram.Message{MessageID: 7, Chat: telegram.Chat{ID: 1}}}}
	_, err = bot.Handle(context.Background(), stale, state)
	if err != nil || api.methods[len(api.methods)-1] != "answerCallbackQuery" || !strings.Contains(api.params[len(api.params)-1]["text"].(string), "out of date") {
		t.Fatalf("%v %+v", err, api.params)
	}
	service, err = flow.NewService(activity, disk)
	if err != nil {
		t.Fatal(err)
	}
	result, err := (Telegram{service}).Show(context.Background(), telegram.Request{})
	if err != nil || result.View.Reading.Page != 2 || result.View.Markdown != "## Second\n\nSecond text." {
		t.Fatalf("%+v %v", result, err)
	}
	result, err = (Telegram{service}).Show(context.Background(), telegram.Request{Action: "prev", Revision: number(result.Revision)})
	if err != nil || result.View.Reading.Page != 1 {
		t.Fatalf("%+v %v", result, err)
	}
	pageView, err := (Web{service}).Open(context.Background(), web.Request{Route: "entity", ID: "m"})
	if err != nil || pageView.Document.Page.Index != 1 {
		t.Fatalf("%+v %v", pageView, err)
	}
	doc := pageView.Document
	explanation, err := (Web{service}).Explain(context.Background(), web.Question{Kind: "simpler", EntityID: "m", Reference: doc.References[0], MaterialRevision: doc.MaterialRevision, Revision: doc.Revision})
	if err != nil || explanation.Available {
		t.Fatalf("%+v %v", explanation, err)
	}
}

type memoryStorage struct{ state flow.State }

func (s *memoryStorage) Load() (flow.State, error) { return s.state, nil }
func (s *memoryStorage) Save(v flow.State) error   { s.state = v; return nil }
func TestConcurrentWebAndTelegramActionsAcceptExactlyOneRevision(t *testing.T) {
	t.Parallel()
	service, err := flow.NewService(flow.Flow{Reader: readingSpy{}, PageSize: 1000}, &memoryStorage{state: flow.InitialState()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := (Web{service}).Open(context.Background(), web.Request{Route: "entity", ID: "m", Page: number(0)}); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	out := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, e := (Web{service}).Open(context.Background(), web.Request{Route: "entity", ID: "m", Page: number(1), Revision: number(1)})
		out <- e
	}()
	go func() {
		defer wg.Done()
		<-start
		_, e := (Telegram{service}).Show(context.Background(), telegram.Request{Action: "next", Revision: number(1)})
		out <- e
	}()
	close(start)
	wg.Wait()
	a, b := <-out, <-out
	stale := func(e error) bool { return errors.Is(e, web.ErrStale) || errors.Is(e, telegram.ErrStale) }
	if !((a == nil && stale(b)) || (b == nil && stale(a))) {
		t.Fatalf("%v %v", a, b)
	}
	final, err := (Telegram{service}).Show(context.Background(), telegram.Request{})
	if err != nil || final.View.Reading.Page != 1 || final.Revision != 3 {
		t.Fatalf("%+v %v", final, err)
	}
}
