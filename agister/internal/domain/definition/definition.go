// Package definition parses and validates Agister's settings documents:
// agents, processes, workflows, verifications, prompts, skills,
// brief forms, runtime permission mappings, the service, the workspace and
// a repository's blocks. It owns the definition language; callers supply
// bytes and their origin.
package definition

import (
	"bytes"
	"fmt"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// readable reports whether data can be a settings document at all. Binary
// content (a stray .DS_Store, a UTF-16 file) gets one plain problem instead
// of whatever the parser makes of it.
func readable(data []byte, p *problems) bool {
	if bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data) {
		p.add("", "not a UTF-8 text file")
		return false
	}
	return true
}

// problems collects field-path problems while reading one document.
type problems struct {
	list []document.Problem
	// source, when it has several layer files, names in each problem the
	// file that set the field at fault (ADR-028 rule 5).
	source document.Source
	// absent are the required fields the document does not set, each also
	// a problem.
	absent []string
}

// problemsOf collects the problems of the document read from source.
func problemsOf(source document.Source) *problems { return &problems{source: source} }

func (p *problems) add(field, format string, args ...any) {
	p.list = append(p.list, document.Problem{Message: p.source.Attribute(field, fieldMessage(field, format, args...))})
}

// missing adds the problem of a required field the document does not
// set.
func (p *problems) missing(field string) {
	p.absent = append(p.absent, field)
	p.add(field, "is required")
}

// unknown adds a problem that names something this code does not know.
func (p *problems) unknown(field, format string, args ...any) {
	p.list = append(p.list, document.Problem{Message: p.source.Attribute(field, fieldMessage(field, format, args...)), Unknown: true})
}

func fieldMessage(field, format string, args ...any) string {
	message := fmt.Sprintf(format, args...)
	if field != "" {
		message = field + ": " + message
	}
	return message
}

func (p *problems) err(subject string) error {
	if len(p.list) == 0 {
		return nil
	}
	return &document.InvalidError{Subject: subject, Problems: p.list}
}

func join(parent, key string) string {
	if parent == "" {
		return key
	}
	return parent + "." + key
}
