package web

import "errors"

var ErrStale = errors.New("page is out of date")
var ErrInvalid = errors.New("invalid reading action")

type Request struct {
	Route, ID      string
	Page, Revision *int
}
type Page struct {
	Programs []ProgramRow
	Program  *Program
	Document *Document
	Resume   *Place
}
type Item struct{ ID, Title, Kind string }
type Course struct {
	Topic        Item
	ConceptCount int
	Materials    []Item
}
type Program struct {
	ID, Title, Description string
	Courses                []Course
	Materials              []Item
}
type PageInfo struct{ Index, Count int }
type Position struct {
	Section      *int
	Label        string
	Index, Count int
}
type ContentsEntry struct {
	Count   int
	Page    int
	N       *int
	Label   string
	Current bool
}
type Document struct {
	ID, Title, Body, Markdown, Kind string
	Items                           []Item
	Page                            *PageInfo
	Position                        *Position
	Sections                        []ContentsEntry
	Program                         *Program
	Course                          *Item
	Previous, Next                  *int
	References                      []string
	Revision                        int
	MaterialRevision                string
}
type Answer struct{ Available bool }
