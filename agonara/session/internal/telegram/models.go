package telegram

import "errors"

var ErrStale = errors.New("button is out of date")

type Request struct {
	Action   string
	Revision *int
}
type Result struct {
	Revision int
	Screen   string
	Page     *PageInfo
	Contents bool
	View     View
	Actions  []Action
}
type PageInfo struct{ Index, Count int }
type ReadingPosition struct {
	Page, Pages    int
	Section        *int
	Heading        string
	Offset, Length int
}
type ContentsEntry struct {
	Page    int
	N       *int
	Label   string
	Current bool
}
type Entry struct {
	ID    string
	N     *int
	Label string
}
type List struct {
	Heading string
	Entries []Entry
}
type View struct {
	Title, Body, Markdown string
	Reading               *ReadingPosition
	Contents              []ContentsEntry
	Lists                 []List
	Empty                 string
}
type Action struct{ ID, Kind, Label string }
