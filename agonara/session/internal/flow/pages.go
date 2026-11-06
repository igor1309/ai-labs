package flow

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// Page is one page of a material: its section title (nil for the intro or for
// text with no sections) and its text.
type Page struct {
	Title *string
	Text  string
}

var (
	frontMatter = regexp.MustCompile(`(?s)^---\n.*?\n---\n+`)
	headingLine = regexp.MustCompile(`^(#{2,6})\s+\S`)
	paragraphs  = regexp.MustCompile(`\n{2,}`)
)

// Material files start with YAML front matter about their conversion, not for the student.
func withoutFrontMatter(text string) string {
	return frontMatter.ReplaceAllString(text, "")
}

// SectionPages cuts a lecture at its top-level section headings (the
// shallowest level below the title); the text before the first one is a page
// of its own, and a section longer than a page runs on over several pages with
// the same title. Text with no sections is paged as is.
func SectionPages(text string, size int) []Page {
	level := 0
	for _, line := range strings.Split(text, "\n") {
		if match := headingLine.FindStringSubmatch(line); match != nil && (level == 0 || len(match[1]) < level) {
			level = len(match[1])
		}
	}
	if level == 0 {
		pages := []Page{}
		for _, page := range Paginate(text, size) {
			pages = append(pages, Page{Text: page})
		}
		return pages
	}
	marker := strings.Repeat("#", level)
	opens := func(line string) bool {
		rest, ok := strings.CutPrefix(line, marker)
		return ok && rest != "" && isSpace(rest[0])
	}
	var parts []string
	var part []string
	for _, line := range strings.Split(strings.TrimSpace(text), "\n") {
		if opens(line) && len(part) > 0 {
			parts = append(parts, strings.Join(part, "\n"))
			part = nil
		}
		part = append(part, line)
	}
	parts = append(parts, strings.Join(part, "\n"))
	pages := []Page{}
	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			continue
		}
		var title *string
		if first, _, _ := strings.Cut(part, "\n"); opens(first) {
			t := strings.TrimSpace(strings.NewReplacer("**", "", "__", "").Replace(strings.TrimLeft(first[level:], " \t")))
			title = &t
		}
		for _, page := range Paginate(part, size) {
			pages = append(pages, Page{Title: title, Text: page})
		}
	}
	return pages
}

// Paginate splits text into pages of at most size characters, at paragraph
// breaks where possible, then at line breaks, then anywhere.
func Paginate(text string, size int) []string {
	var pieces []string
	for _, paragraph := range paragraphs.Split(strings.TrimSpace(text), -1) {
		pieces = append(pieces, cut(paragraph, size)...)
	}
	return pack(pieces, "\n\n", size)
}

func cut(paragraph string, size int) []string {
	if length(paragraph) <= size {
		return []string{paragraph}
	}
	var lines []string
	for _, line := range strings.Split(paragraph, "\n") {
		runes := []rune(line)
		if len(runes) <= size {
			lines = append(lines, line)
			continue
		}
		for start := 0; start < len(runes); start += size {
			lines = append(lines, string(runes[start:min(start+size, len(runes))]))
		}
	}
	return pack(lines, "\n", size)
}

func pack(pieces []string, joiner string, size int) []string {
	out := []string{}
	chunk := ""
	for _, piece := range pieces {
		if chunk != "" && length(chunk)+length(joiner)+length(piece) > size {
			out = append(out, chunk)
			chunk = piece
		} else if chunk != "" {
			chunk += joiner + piece
		} else {
			chunk = piece
		}
	}
	return append(out, chunk)
}

func length(text string) int { return utf8.RuneCountInString(text) }

func isSpace(b byte) bool { return b == ' ' || b == '\t' }
