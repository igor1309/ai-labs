package web

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

type sessionSpy struct {
	open      func(Request) (*Page, error)
	question  Question
	answerErr error
}

func (s *sessionSpy) Open(_ context.Context, q Request) (*Page, error) { return s.open(q) }
func (s *sessionSpy) Explain(_ context.Context, q Question) (Answer, error) {
	s.question = q
	return Answer{Available: false}, s.answerErr
}
func newServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	program := &Program{ID: "p", Title: "Агенты на практике", Description: "От вызова до агента.", Courses: []Course{{Topic: Item{ID: "t", Title: "Что такое агент"}, Materials: []Item{{ID: "m", Title: "Лекция: агент и бот"}}}}}
	spy := &sessionSpy{open: func(q Request) (*Page, error) {
		switch q.Route {
		case "programs":
			return &Page{Programs: []ProgramRow{{ID: "p", Title: program.Title, Topics: 1}}, Resume: &Place{EntityID: "m", Page: 1}}, nil
		case "program":
			return &Page{Program: program}, nil
		default:
			if q.ID != "m" || q.Page == nil || *q.Page != 1 {
				t.Fatalf("request %+v", q)
			}
			prev, next := 0, 2
			n := 1
			return &Page{Document: &Document{ID: "m", Title: "Лекция: агент и бот", Markdown: "## Цикл агента\n\nАгент <выбирает> шаг.\n\nОтличие от бота.", Page: &PageInfo{Index: 1, Count: 3}, Position: &Position{Section: &n, Label: "Цикл агента", Count: 1}, Sections: []ContentsEntry{{Page: 0, Label: "Intro", Count: 1}, {Page: 1, N: &n, Label: "Цикл агента", Current: true, Count: 1}, {Page: 2, N: intPtr(2), Label: "Инструменты", Count: 1}}, Program: program, Course: &Item{ID: "t", Title: "Что такое агент"}, Previous: &prev, Next: &next, References: []string{"ref-a", "ref-b"}, Revision: 7, MaterialRevision: "material-revision"}}, nil
		}
	}}
	s := &Server{Session: spy, Token: "secret"}
	h, err := s.Handler()
	if err != nil {
		t.Fatal(err)
	}
	return s, h
}
func intPtr(n int) *int { return &n }

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
	t.Parallel()
	_, h := newServer(t)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), "Ссылка больше не действует") {
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
	t.Parallel()
	_, h := newServer(t)
	code, body := fetch(t, h, "/p/p")
	if code != 200 {
		t.Fatal(code)
	}
	contains(t, body, "1 тема · 0 понятий · 1 с материалами", "Агенты на практике", "От вызова до агента.", `<span class="row-name">Что такое агент</span>`, `class="read" href="/m/m"`, "Лекция: агент и бот")
}

func TestReadingPageShowsSectionsReferencesAndPager(t *testing.T) {
	t.Parallel()
	_, h := newServer(t)
	code, body := fetch(t, h, "/m/m?page=1")
	if code != 200 {
		t.Fatal(code)
	}
	contains(t, body,
		`<h1 class="heading">Цикл агента</h1>`, "§1",
		`data-entity="m" data-revision="7" data-material-revision="material-revision" data-page="1"`,
		`data-n="1" data-reference="ref-a"`, "Агент &lt;выбирает&gt; шаг.", `data-n="2" data-reference="ref-b"`,
		`href="/m/m?page=0" rel="prev"`, "<b>Введение</b>",
		`href="/m/m?page=2" rel="next"`, "<b>§2 Инструменты</b>",
		`o-section current`, "Что такое агент")
	if strings.Contains(body, "para-n") {
		t.Error("paragraph numbers are back on the page")
	}
	_, programs := fetch(t, h, "/")
	contains(t, programs, "Продолжить чтение", `href="/m/m?page=1"`)
}

func TestUnavailableExplanationNamesActionAndUsesSessionPort(t *testing.T) {
	t.Parallel()
	server, h := newServer(t)
	req := httptest.NewRequest("POST", "/api/answer", strings.NewReader(`{"kind":"simpler","entityId":"m","page":1,"paragraph":2,"reference":"ref-b","materialRevision":"material-revision","revision":7}`))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: "secret"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	q := server.Session.(*sessionSpy).question
	if q.Reference != "ref-b" || q.Revision != 7 || q.MaterialRevision != "material-revision" {
		t.Fatalf("question %+v", q)
	}
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "Объясни проще") || !strings.Contains(rec.Body.String(), `"available":false`) {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestWebPassesRevisionAndReportsStaleAndStorageErrors(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		err    error
		status int
	}{{ErrStale, 409}, {ErrInvalid, 400}, {errors.New("storage unavailable"), 502}} {
		t.Run(strconv.Itoa(tc.status), func(t *testing.T) {
			t.Parallel()
			var request Request
			spy := &sessionSpy{open: func(q Request) (*Page, error) { request = q; return nil, tc.err }}
			s := &Server{Session: spy, Token: "secret"}
			h, err := s.Handler()
			if err != nil {
				t.Fatal(err)
			}
			code, _ := fetch(t, h, "/m/m?page=2&rev=8")
			if code != tc.status || request.ID != "m" || *request.Page != 2 || *request.Revision != 8 {
				t.Fatalf("%d %+v", code, request)
			}
		})
	}
}

func TestLongTitlesAndParagraphReferencesStayEscapedInMarkup(t *testing.T) {
	t.Parallel()
	title := strings.Repeat("Длинное название ", 30) + `<script>"&`
	s := &Server{Token: "secret", Session: &sessionSpy{open: func(Request) (*Page, error) {
		return &Page{Document: &Document{ID: "m", Title: title, Markdown: "Text <unsafe> & **bold**.", Page: &PageInfo{Count: 1}, Position: &Position{Count: 1}, Sections: []ContentsEntry{{Page: 0, Label: title, Count: 1, Current: true}}, References: []string{`ref"<&`}, Revision: 4, MaterialRevision: `material"<&`}}, nil
	}}}
	h, err := s.Handler()
	if err != nil {
		t.Fatal(err)
	}
	code, body := fetch(t, h, "/m/m")
	contains(t, body, `data-revision="4" data-material-revision="material&#34;&lt;&amp;"`)
	if code != 200 || strings.Contains(body, "<script>\"") || !strings.Contains(body, strings.Repeat("Длинное название ", 30)+"&lt;script&gt;&#34;&amp;") || !strings.Contains(body, `data-reference="ref&#34;&lt;&amp;"`) || !strings.Contains(body, "Text &lt;unsafe&gt; &amp; <b>bold</b>.") {
		t.Fatalf("%d %s", code, body)
	}
}
