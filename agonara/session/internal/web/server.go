// Package web draws the session as a web page for the owner's local network:
// programs, a program by course, and a lecture read a page at a time, with a
// menu on each paragraph. Screens come from the same flow as the Telegram bot.
package web

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
)

//go:embed templates/*.html
var templateFiles embed.FS

//go:embed static
var staticFiles embed.FS

const cookieName = "agonara_web"

type Session interface {
	Open(context.Context, Request) (*Page, error)
	Explain(context.Context, Question) (Answer, error)
}

// Server renders the reading session and guards every request with its access token.
type Server struct {
	Session Session
	Token   string
	Log     func(string)

	pages *template.Template
}

// Place is where the reader last read.
type Place struct {
	ProgramID string `json:"programId"`
	EntityID  string `json:"entityId"`
	Title     string `json:"title"`
	Page      int    `json:"page"`
	Label     string `json:"label"`
	Topic     string
	Course    string
	Courses   []Item
	Position  *Position
}

// Where names the place for Continue reading: "Тема 3 · §1 · 6/10".
func (p Place) Where() string {
	label := p.Label
	if p.Position != nil {
		label = "Введение"
		if p.Position.Section != nil {
			label = "§" + strconv.Itoa(*p.Position.Section)
		} else if p.Position.Label != "" {
			label = p.Position.Label
		}
		if p.Position.Count > 1 {
			label += fmt.Sprintf(" · %d/%d", p.Position.Index+1, p.Position.Count)
		}
	}
	topic := p.Topic
	if topic == "" {
		for _, course := range p.Courses {
			label, _, module, _ := split(course.Title)
			if !module {
				topic = label
				if topic == "" {
					topic = course.Title
				}
				break
			}
		}
	}
	if topic == "" {
		label, _, module, _ := split(p.Title)
		if !module && label != "" {
			topic = label
		}
	}

	if topic == "" && p.Course != "" {
		topic, _, _, _ = split(p.Course)
		if topic == "" {
			topic = p.Course
		}
	}
	if topic == "" {
		topic, _, _, _ = split(p.Title)
	}
	if topic != "" {
		return topic + " · " + label
	}
	return p.Title + " · " + label
}

// Handler returns the routes.
func (s *Server) Handler() (http.Handler, error) {
	if s.Session == nil {
		return nil, errors.New("web session is required")
	}
	if s.Token == "" {
		return nil, errors.New("web token is required")
	}
	pages, err := template.New("").Funcs(template.FuncMap{
		"two":    func(n int) string { return fmt.Sprintf("%02d", n) },
		"inc":    func(n int) int { return n + 1 },
		"sub":    func(a, b int) int { return a - b },
		"plural": plural,
		"mark": func(label string) string {
			if strings.HasPrefix(label, "§") {
				mark, _, _ := strings.Cut(label, " ")
				return mark
			}
			return ""
		},
		"rest": func(label string) string {
			if strings.HasPrefix(label, "§") {
				if _, rest, ok := strings.Cut(label, " "); ok {
					return rest
				}
			}
			return label
		},
		"pair": func(a, b any) map[string]any { return map[string]any{"A": a, "B": b} },
	}).ParseFS(templateFiles, "templates/*.html")
	if err != nil {
		return nil, err
	}
	s.pages = pages
	static, _ := fs.Sub(staticFiles, "static")
	mux := http.NewServeMux()
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(static)))
	mux.HandleFunc("GET /{$}", s.programs)
	mux.HandleFunc("GET /p/{id}", s.program)
	mux.HandleFunc("GET /m/{id}", s.entity)
	mux.HandleFunc("POST /api/answer", s.answer)
	return s.guard(mux), nil
}

// guard lets in a request carrying the token as a cookie, or as ?token= once,
// which sets the cookie and redirects to the same page without it.
func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie(cookieName); err == nil && s.valid(cookie.Value) {
			next.ServeHTTP(w, r)
			return
		}
		if token := r.URL.Query().Get("token"); token != "" && s.valid(token) {
			http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 365 * 24 * 3600})
			query := r.URL.Query()
			query.Del("token")
			target := r.URL.Path
			if encoded := query.Encode(); encoded != "" {
				target += "?" + encoded
			}
			http.Redirect(w, r, target, http.StatusSeeOther)
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		s.render(w, "error.html", map[string]any{"Title": "Ссылка больше не действует", "Message": "У ссылки нет ключа доступа или он неверный. Откройте ссылку с ?token=… из probe.env (WEB_TOKEN).", "Icon": "unlink"})
	})
}

func (s *Server) valid(token string) bool {
	return subtle.ConstantTimeCompare([]byte(token), []byte(s.Token)) == 1
}

func (s *Server) log(format string, args ...any) {
	if s.Log != nil {
		s.Log(fmt.Sprintf(format, args...))
	}
}

func (s *Server) render(w http.ResponseWriter, name string, data any) {
	var out strings.Builder
	if err := s.pages.ExecuteTemplate(&out, name, data); err != nil {
		s.log("render %s: %v", name, err)
		http.Error(w, "page failed to render", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, out.String())
}

// fail answers an Agonara error with a short page; the error names a route,
// never a secret.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, ErrStale) {
		http.Error(w, "Страница устарела. Обновите страницу.", http.StatusConflict)
		return
	}
	if errors.Is(err, ErrInvalid) {
		http.Error(w, "Недоступное действие", http.StatusBadRequest)
		return
	}
	path := r.URL.Path
	if strings.Contains(path, "token") {
		path = "(path withheld)"
	}
	s.log("%s %s: %v", r.Method, path, err)
	w.WriteHeader(http.StatusBadGateway)
	s.render(w, "error.html", map[string]any{"Title": "Agonara не отвечает", "Message": "Страница не загрузилась: Agonara не ответила. Попробуйте обновить страницу.", "Icon": "offline", "Retry": true})
}

func (s *Server) programs(w http.ResponseWriter, r *http.Request) {
	page, err := s.Session.Open(r.Context(), Request{Route: "programs"})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var full, empty []ProgramRow
	for _, row := range page.Programs {
		if row.Topics > 0 {
			full = append(full, row)
		} else {
			empty = append(empty, row)
		}
	}
	s.render(w, "programs.html", map[string]any{"Full": full, "Empty": empty, "Count": len(page.Programs), "Place": page.Resume})
}
func (s *Server) program(w http.ResponseWriter, r *http.Request) {
	page, err := s.Session.Open(r.Context(), Request{Route: "program", ID: r.PathValue("id")})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	place := page.Resume
	if place != nil && place.ProgramID != page.Program.ID {
		place = nil
	}
	s.render(w, "program.html", map[string]any{"Program": page.Program, "Outline": newOutline(page.Program), "Place": place})
}

// ProgramRow is a program in the list, with how many topics it has.
type ProgramRow struct {
	ID, Title string
	Topics    int
}

// Pager is a link to the page before or after.
type Pager struct {
	Page  int
	Label string
}

// Section is one entry of a lecture's contents.
type Section struct {
	Page    int
	Label   string
	Current bool
	Count   int
}

// Reading is a lecture page.
type Reading struct {
	Revision         int
	MaterialRevision string
	EntityID         string
	Title            string // the lecture
	Heading          string // the section, or the lecture for the intro
	Eyebrow          string // "§1 · страница 2 из 5"
	Page             int
	Pages            int
	Index            int // page within the section
	Count            int // pages in the section
	Blocks           []Block
	Prev, Next       *Pager
	Sections         []Section
	Program          *Program
	Outline          Outline
	Home             *Row // the topic the lecture lives in
	Course           *Item
	Linked           []Item
	Intro            string
}

func (s *Server) entity(w http.ResponseWriter, r *http.Request) {
	request := Request{Route: "entity", ID: r.PathValue("id")}
	if value := r.URL.Query().Get("page"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 0 {
			http.Error(w, "bad page", 400)
			return
		}
		request.Page = &n
	}
	if value := r.URL.Query().Get("rev"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 0 {
			http.Error(w, "bad revision", 400)
			return
		}
		request.Revision = &n
	}
	page, err := s.Session.Open(r.Context(), request)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	doc := page.Document
	if doc.Page == nil {
		s.render(w, "entity.html", map[string]any{"Title": doc.Title, "Body": Blocks(doc.Body), "Items": doc.Items, "Program": doc.Program, "Course": doc.Course, "Kind": doc.Kind})
		return
	}
	s.render(w, "reading.html", reading(doc))
}
func reading(doc *Document) *Reading {
	reading := &Reading{
		EntityID: doc.ID, Title: doc.Title, Heading: doc.Title,
		Page: doc.Page.Index, Pages: doc.Page.Count, Index: 0, Count: 1,
		Blocks: sourceBlocks(doc.Fragments), Program: doc.Program, Course: doc.Course, Intro: doc.Body,
		Outline: newOutline(doc.Program), Revision: doc.Revision, MaterialRevision: doc.MaterialRevision,
	}
	course := doc.Course
	reading.Home = reading.Outline.home(reading.EntityID)
	defer func() {
		// The intro of a lecture named like its topic is headed "Введение",
		// not the topic's title a second time.
		if reading.Own() && reading.Eyebrow == "Введение" {
			reading.Heading, reading.Eyebrow = "Введение", ""
		}
	}()
	if reading.Home == nil && course != nil {
		label, name, module, _ := split(course.Title)
		reading.Home = &Row{ID: course.ID, Full: course.Title, Label: label, Name: name, Module: module}
	}
	for _, entry := range doc.Sections {
		reading.Sections = append(reading.Sections, Section{Page: entry.Page, Label: sectionLabel(entry.N, entry.Label), Current: entry.Current, Count: entry.Count})
	}
	if len(reading.Sections) == 0 {
		reading.Sections = []Section{{Page: 0, Label: doc.Title}}
	}
	if position := doc.Position; position != nil {
		reading.Index, reading.Count = position.Index, position.Count
		if position.Label != "" {
			reading.Heading = position.Label
		}
		eyebrow := "Введение"
		if position.Section != nil {
			eyebrow = "§" + strconv.Itoa(*position.Section)
		} else if position.Label != "" {
			eyebrow = ""
		}
		if len(doc.Sections) < 2 {
			eyebrow = ""
		}
		reading.Eyebrow = eyebrow
	} else {
		reading.Index, reading.Count = reading.Page, reading.Pages
	}
	if doc.Previous != nil {
		reading.Prev = &Pager{Page: *doc.Previous, Label: reading.pageLabel(*doc.Previous)}
	}
	if doc.Next != nil {
		reading.Next = &Pager{Page: *doc.Next, Label: reading.pageLabel(*doc.Next)}
	}
	reading.Linked = doc.Items
	return reading
}

func sectionLabel(n *int, label string) string {
	if n == nil {
		if label == "Intro" {
			return "Введение"
		}
		return label
	}
	return "§" + strconv.Itoa(*n) + " " + label
}

func (r *Reading) sectionOf(page int) int {
	current := 0
	for index, section := range r.Sections {
		if section.Page <= page {
			current = index
		}
	}
	return current
}

// pageLabel names a page by its section, with its place in it when the
// section runs over several pages.
func (r *Reading) pageLabel(page int) string {
	section := r.Sections[r.sectionOf(page)]
	if section.Count > 1 {
		return fmt.Sprintf("%s · %d/%d", section.Label, page-section.Page+1, section.Count)
	}
	return section.Label
}

// Here names the current page for the bottom bar: "Введение · 1/2".
func (r *Reading) Here() string { return r.pageLabel(r.Page) }

// Own says whether the lecture repeats its topic's title, so the page prints it once.
func (r *Reading) Own() bool {
	return r.Home != nil && (r.Title == r.Home.Full || r.Title == r.Home.Name)
}

// Short is where the reader is, for the sidebar: "§1 · 2/5".
func (r *Reading) Short() string { return r.short() }

// short is where the reader is, for Continue reading: "§1 · 2/5".
func (r *Reading) short() string {
	label := r.Eyebrow
	if label == "" {
		label = r.Heading
	}
	if r.Count > 1 {
		label += fmt.Sprintf(" · %d/%d", r.Index+1, r.Count)
	}
	return label
}

// Steps is one mark per page of the section, for the progress bar.
func (r *Reading) Steps() []bool {
	steps := make([]bool, r.Count)
	for index := range steps {
		steps[index] = index <= r.Index
	}
	return steps
}

// Question is what the paragraph menu asks.
type Question struct {
	Reference        string `json:"reference"`
	MaterialRevision string `json:"materialRevision"`
	Revision         int    `json:"revision"`
	Kind             string `json:"kind"` // more, simpler, example or ask
	EntityID         string `json:"entityId"`
	Page             int    `json:"page"`
	Paragraph        int    `json:"paragraph"`
	Text             string `json:"text"`
}

func answerTitle(kind string) (string, bool) {
	switch kind {
	case "more":
		return "Расскажи подробнее", true
	case "simpler":
		return "Объясни проще", true
	case "example":
		return "Приведи пример", true
	case "ask":
		return "Вопрос", true
	}
	return "", false
}

// answer renders the activity's capability result, including unavailable explanations.
func (s *Server) answer(w http.ResponseWriter, r *http.Request) {
	var question Question
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&question); err != nil {
		http.Error(w, "bad question", 400)
		return
	}
	title, ok := answerTitle(question.Kind)
	if !ok {
		http.Error(w, "unknown kind", 400)
		return
	}
	answer, err := s.Session.Explain(r.Context(), question)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"title": title, "available": answer.Available, "text": "Объяснения пока недоступны."})
}

// plural picks the Russian form for n: one (курс), few (курса) or many (курсов).
func plural(n int, one, few, many string) string {
	switch {
	case n%10 == 1 && n%100 != 11:
		return one
	case n%10 >= 2 && n%10 <= 4 && (n%100 < 12 || n%100 > 14):
		return few
	}
	return many
}
