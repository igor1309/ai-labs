package web

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

type reader struct{ entities map[string]agonara.Entity }

func (reader) ListPrograms(context.Context) ([]agonara.Program, error) {
	return []agonara.Program{{ProgramID: "p", Title: "Агенты на практике", Description: "От вызова до агента."}}, nil
}

func (reader) Navigation(context.Context, string) (agonara.Navigation, error) {
	return agonara.Navigation{Topics: []agonara.Node{{EntityID: "t", AcceptedKind: "topic", Title: "Что такое агент"}}}, nil
}

func (r reader) Entity(_ context.Context, id string) (agonara.Entity, error) {
	return r.entities[id], nil
}

func (reader) MaterialContent(context.Context, string) (string, error) {
	return "# Лекция\n\nВступление.\n\n## Цикл агента\n\nАгент <выбирает> шаг.\n\nОтличие от бота.\n\n## Инструменты\n\nВызов.", nil
}

func newServer(t *testing.T) (*Server, http.Handler) {
	topic := agonara.Entity{EntityID: "t", ProgramID: "p", AcceptedKind: "topic", Title: "Что такое агент"}
	topic.Relationships.Outgoing = []agonara.Link{{ToEntityID: "m", ToKind: "material_reference", ToTitle: "Лекция: агент и бот"}}
	lecture := agonara.Entity{EntityID: "m", ProgramID: "p", AcceptedKind: "material_reference", Title: "Лекция: агент и бот", HasContent: true}
	lecture.Relationships.Incoming = []agonara.Link{{FromEntityID: "t", FromKind: "topic", FromTitle: "Что такое агент"}}
	s := &Server{
		Flow:      flow.Flow{Reader: reader{map[string]agonara.Entity{"t": topic, "m": lecture}}},
		Token:     "secret",
		PlacePath: filepath.Join(t.TempDir(), "place.json"),
	}
	h, err := s.Handler()
	if err != nil {
		t.Fatal(err)
	}
	return s, h
}

func fetch(t *testing.T, h http.Handler, path string) (int, string) {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: "secret"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func contains(t *testing.T, body string, parts ...string) {
	t.Helper()
	for _, part := range parts {
		if !strings.Contains(body, part) {
			t.Errorf("page lacks %q", part)
		}
	}
}

func TestGuardRefusesWithoutTokenAndTradesTheQueryTokenForACookie(t *testing.T) {
	_, h := newServer(t)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no token: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/p/p?token=wrong", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong token: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/p/p?token=secret", nil))
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/p/p" || !strings.Contains(rec.Header().Get("Set-Cookie"), "HttpOnly") {
		t.Fatalf("token: %d %q %q", rec.Code, rec.Header().Get("Location"), rec.Header().Get("Set-Cookie"))
	}
}

func TestProgramPageNestsMaterialsUnderTheirCourse(t *testing.T) {
	_, h := newServer(t)
	code, body := fetch(t, h, "/p/p")
	if code != 200 {
		t.Fatal(code)
	}
	contains(t, body, "Программа · 1 курс", "Агенты на практике", "От вызова до агента.", `<span class="course-n">01</span>`, `href="/m/m"`, "Лекция: агент и бот")
}

func TestReadingPageShowsSectionParagraphsPagerAndSavesThePlace(t *testing.T) {
	_, h := newServer(t)
	code, body := fetch(t, h, "/m/m?page=1")
	if code != 200 {
		t.Fatal(code)
	}
	contains(t, body,
		`<h1 class="heading">Цикл агента</h1>`, "§1",
		`data-n="1"`, "Агент &lt;выбирает&gt; шаг.", `data-n="2"`,
		`href="/m/m?page=0" rel="prev"`, "<b>Введение</b>",
		`href="/m/m?page=2" rel="next"`, "<b>§2 Инструменты</b>",
		`class="o-section current"`, "Что такое агент")
	_, programs := fetch(t, h, "/")
	contains(t, programs, "Продолжить чтение", `href="/m/m?page=1"`)
}

func TestAnswerIsAStubThatNamesTheAction(t *testing.T) {
	_, h := newServer(t)
	req := httptest.NewRequest("POST", "/api/answer", strings.NewReader(`{"kind":"simpler","entityId":"m","page":1,"paragraph":2}`))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: "secret"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "Объясни проще") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}
