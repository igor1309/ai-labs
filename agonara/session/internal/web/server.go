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

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/store"
)

//go:embed templates/*.html
var templateFiles embed.FS

//go:embed static
var staticFiles embed.FS

const cookieName = "agonara_web"

// Server serves the page. Token guards every request; PlacePath keeps where
// the reader last was, for Continue reading.
type Server struct {
	Flow      flow.Flow
	Token     string
	PlacePath string
	Log       func(string)

	pages *template.Template
}

// Place is where the reader last read.
type Place struct {
	ProgramID string `json:"programId"`
	EntityID  string `json:"entityId"`
	Title     string `json:"title"`
	Page      int    `json:"page"`
	Label     string `json:"label"`
	Topic     string `json:"topic,omitempty"` // "Тема 3", where the lecture lives
}

// Where names the place for Continue reading: "Тема 3 · §1 · 6/10".
func (p Place) Where() string {
	topic := p.Topic
	if topic == "" {
		topic, _, _, _ = split(p.Title)
	}
	if topic != "" {
		return topic + " · " + p.Label
	}
	return p.Title + " · " + p.Label
}

// Handler returns the routes.
func (s *Server) Handler() (http.Handler, error) {
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
	path := r.URL.Path
	if strings.Contains(path, "token") {
		path = "(path withheld)"
	}
	s.log("%s %s: %v", r.Method, path, err)
	w.WriteHeader(http.StatusBadGateway)
	s.render(w, "error.html", map[string]any{"Title": "Agonara не отвечает", "Message": "Страница не загрузилась: Agonara не ответила. Попробуйте обновить страницу.", "Icon": "offline", "Retry": true})
}

func (s *Server) place() *Place {
	if s.PlacePath == "" {
		return nil
	}
	place, err := store.Load(s.PlacePath, func() Place { return Place{} })
	if err != nil || place.EntityID == "" {
		return nil
	}
	return &place
}

func (s *Server) programs(w http.ResponseWriter, r *http.Request) {
	programs, err := s.Flow.Reader.ListPrograms(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	// Programs with topics come first; empty ones gather below, dimmed.
	var full, empty []ProgramRow
	for _, p := range programs {
		navigation, err := s.Flow.Reader.Navigation(r.Context(), p.ProgramID)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		row := ProgramRow{ID: p.ProgramID, Title: p.Title, Topics: len(navigation.Topics)}
		if row.Topics > 0 {
			full = append(full, row)
		} else {
			empty = append(empty, row)
		}
	}
	s.render(w, "programs.html", map[string]any{"Full": full, "Empty": empty, "Count": len(programs), "Place": s.place()})
}

func (s *Server) program(w http.ResponseWriter, r *http.Request) {
	program, err := s.Flow.Program(r.Context(), r.PathValue("id"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	place := s.place()
	if place != nil && place.ProgramID != program.ID {
		place = nil
	}
	s.render(w, "program.html", map[string]any{"Program": program, "Outline": newOutline(program), "Place": place})
}

// ProgramRow is a program in the list, with how many topics it has.
type ProgramRow struct {
	ID, Title string
	Topics    int
}

// linkedCourse is the first topic linking to an entity.
func linkedCourse(entity agonara.Entity) *flow.Item {
	for _, link := range entity.Relationships.Incoming {
		if link.FromKind == "topic" {
			return &flow.Item{ID: link.FromEntityID, Title: link.FromTitle, Kind: "topic"}
		}
	}
	return nil
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
	EntityID   string
	Title      string // the lecture
	Heading    string // the section, or the lecture for the intro
	Eyebrow    string // "§1 · страница 2 из 5"
	Page       int
	Pages      int
	Index      int // page within the section
	Count      int // pages in the section
	Blocks     []Block
	Prev, Next *Pager
	Sections   []Section
	Program    *flow.Program
	Outline    Outline
	Home       *Row // the topic the lecture lives in
	Course     *flow.Item
	Linked     []flow.Item
	Intro      string
}

func (s *Server) entity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	page = max(page, 0)
	session := flow.Session{Place: flow.Place{Screen: "entity", EntityID: id, Page: &page}, Items: []flow.Item{}, History: []flow.Place{}}
	result, err := s.Flow.Act(ctx, session, "")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	entity, err := s.Flow.Reader.Entity(ctx, id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var program *flow.Program
	if entity.ProgramID != "" {
		if program, err = s.Flow.Program(ctx, entity.ProgramID); err != nil {
			s.fail(w, r, err)
			return
		}
	}
	course := linkedCourse(entity)
	if program != nil {
		// A lecture's linked topic can be a module outside the program's
		// topics; the first course that lists the lecture is the one to open.
		course = nil
	courses:
		for _, c := range program.Courses {
			for _, m := range c.Materials {
				if m.ID == id {
					topic := c.Topic
					course = &topic
					break courses
				}
			}
		}
		if course == nil {
			course = linkedCourse(entity)
		}
	}
	view := result.View
	if view.Page == nil {
		s.render(w, "entity.html", map[string]any{
			"Title": view.Title, "Body": Blocks(view.Body), "Items": result.Session.Items,
			"Program": program, "Course": course, "Kind": entity.AcceptedKind,
		})
		return
	}
	reading, err := s.reading(ctx, result, program, course)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if s.PlacePath != "" && program != nil {
		place := Place{ProgramID: program.ID, EntityID: id, Title: reading.Title, Page: reading.Page, Label: reading.short()}
		if reading.Home != nil {
			place.Topic = reading.Home.Label
		}
		if err := store.Save(s.PlacePath, place); err != nil {
			s.log("save place: %v", err)
		}
	}
	s.render(w, "reading.html", reading)
}

func (s *Server) reading(ctx context.Context, result *flow.Result, program *flow.Program, course *flow.Item) (*Reading, error) {
	view := result.View
	reading := &Reading{
		EntityID: result.Session.EntityID, Title: view.Title, Heading: view.Title,
		Page: view.Page.Index, Pages: view.Page.Count, Index: 0, Count: 1,
		Blocks: Blocks(view.Markdown), Program: program, Course: course, Intro: view.Body,
		Outline: newOutline(program),
	}
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
	// The contents page lists each section by its first page, and the
	// lecture's linked items.
	contents := result
	if view.Page.Count > 1 {
		var err error
		if contents, err = s.Flow.Act(ctx, result.Session, "contents"); err != nil {
			return nil, err
		}
		if contents == nil {
			contents = result
		}
	}
	for _, entry := range contents.View.Contents {
		reading.Sections = append(reading.Sections, Section{Page: entry.Page, Label: sectionLabel(entry.N, entry.Label)})
	}
	if len(reading.Sections) == 0 {
		reading.Sections = []Section{{Page: 0, Label: view.Title}}
	}
	for index := range reading.Sections {
		end := reading.Pages
		if index+1 < len(reading.Sections) {
			end = reading.Sections[index+1].Page
		}
		reading.Sections[index].Count = end - reading.Sections[index].Page
	}
	current := reading.sectionOf(reading.Page)
	reading.Sections[current].Current = true
	if position := view.Position; position != nil {
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
		if len(contents.View.Contents) < 2 {
			eyebrow = ""
		}
		reading.Eyebrow = eyebrow
	} else {
		reading.Index, reading.Count = reading.Page, reading.Pages
	}
	if reading.Page > 0 {
		reading.Prev = &Pager{Page: reading.Page - 1, Label: reading.pageLabel(reading.Page - 1)}
	}
	if reading.Page+1 < reading.Pages {
		reading.Next = &Pager{Page: reading.Page + 1, Label: reading.pageLabel(reading.Page + 1)}
	}
	reading.Linked = contents.Session.Items
	return reading, nil
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
	Kind      string `json:"kind"` // more, simpler, example or ask
	EntityID  string `json:"entityId"`
	Page      int    `json:"page"`
	Paragraph int    `json:"paragraph"`
	Text      string `json:"text"`
}

var answerTitles = map[string]string{
	"more": "Расскажи подробнее", "simpler": "Объясни проще", "example": "Приведи пример", "ask": "Вопрос",
}

// answer is a stub until a model is chosen: it says so in place of an answer.
func (s *Server) answer(w http.ResponseWriter, r *http.Request) {
	var question Question
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&question); err != nil {
		http.Error(w, "bad question", http.StatusBadRequest)
		return
	}
	title, ok := answerTitles[question.Kind]
	if !ok {
		http.Error(w, "unknown kind", http.StatusBadRequest)
		return
	}
	s.log("ask %s about %s page %d paragraph %d", question.Kind, question.EntityID, question.Page, question.Paragraph)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"title": title,
		"text":  "Ответы пока не подключены: модель ещё не выбрана. Здесь появится ответ к этому абзацу.",
	})
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
