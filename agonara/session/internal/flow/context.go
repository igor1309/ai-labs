package flow

import (
	"context"
	"crypto/sha256"
	"fmt"
	"regexp"
	"strings"
)

// ReadingContext identifies source text within a particular immutable material revision.
type ReadingContext struct {
	MaterialID, Revision string
	Paragraphs           []Paragraph
	Sections             []ContentsEntry
	Previous, Next       *int
	Program              *Program
	Course               *Item
	Courses              []Item
}
type Paragraph struct{ Reference, Text string }

var contextBreak = regexp.MustCompile(`\n\s*\n`)
var contextHeading = regexp.MustCompile(`^#{1,6}\s+.*(?:\n|$)`)

func contextFor(node Entity, content string, pages []Page, page int) *ReadingContext {
	revision := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))
	out := &ReadingContext{MaterialID: node.ID, Revision: revision}
	_, out.Sections = locate(pages, page)
	if page > 0 {
		n := page - 1
		out.Previous = &n
	}
	if page+1 < len(pages) {
		n := page + 1
		out.Next = &n
	}
	// Offsets include source headings and metadata, even when neither is displayed.
	cursor := len(content) - len(withoutFrontMatter(content))
	for i, p := range pages {
		for _, chunk := range contextBreak.Split(strings.TrimSpace(p.Text), -1) {
			raw := strings.TrimSpace(chunk)
			if raw == "" {
				continue
			}
			start := strings.Index(content[cursor:], raw)
			if start < 0 {
				continue
			}
			start += cursor
			cursor = start + len(raw)
			text := strings.TrimSpace(contextHeading.ReplaceAllString(raw, ""))
			if text == "" {
				continue
			}
			offset := start + strings.Index(raw, text)
			if i == page {
				out.Paragraphs = append(out.Paragraphs, Paragraph{Reference: fmt.Sprintf("%s:%d", revision, offset), Text: text})
			}
		}
	}
	return out
}

// locateParents uses only the opened entity to preserve a return path without
// making reading depend on other topics being available.
func (f Flow) locateParents(result *Result) {
	if result.entity == nil {
		return
	}
	if result.Context == nil {
		result.Context = &ReadingContext{}
	}
	c := result.Context
	if result.entity.ProgramID != "" {
		c.Program = &Program{ID: result.entity.ProgramID}
	}
	for _, parent := range result.entity.Parents {
		if parent.Kind == "topic" {
			c.Courses = append(c.Courses, parent)
			if c.Course == nil {
				p := parent
				c.Course = &p
			}
		}
	}
}

// describe supplies a complete outline only when explicitly requested.
func (f Flow) describe(ctx context.Context, result *Result) error {
	if result.entity == nil || result.entity.ProgramID == "" {
		return nil
	}
	c := result.Context
	program, err := f.Program(ctx, result.entity.ProgramID)
	if err != nil {
		return err
	}
	c.Program = program
	c.Courses = nil
	for _, course := range program.Courses {
		for _, m := range course.Materials {
			if m.ID == result.entity.ID {
				p := course.Topic
				if len(c.Courses) == 0 {
					c.Course = &p
				}
				c.Courses = append(c.Courses, p)
			}
		}
	}
	return nil
}

func directHistory(result *Result) {
	result.Session.History = []Place{{Screen: "programs"}}
	c := result.Context
	if c == nil {
		return
	}
	if c.Program != nil {
		result.Session.History = append(result.Session.History, Place{Screen: "program", ProgramID: c.Program.ID, Title: c.Program.Title})
	}
	if c.Course != nil {
		result.Session.History = append(result.Session.History, Place{Screen: "entity", EntityID: c.Course.ID})
	}
}
