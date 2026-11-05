package web

import (
	"html/template"
	"regexp"
	"strconv"
	"strings"

	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
)

// Block is one block of a page: a paragraph or list the reader can ask about
// (numbered from 1), or a heading.
type Block struct {
	Kind  string // "p", "ul", "ol" or "h"
	N     int    // paragraph number; 0 for a heading
	HTML  template.HTML
	Items []template.HTML
	Start int    // first number of an ordered list
	Text  string // plain text, for the menu's quote
}

var (
	headingLine = regexp.MustCompile(`^#{1,6}\s+(.*)$`)
	bulletLine  = regexp.MustCompile(`^\s*[-*+]\s+(.*)$`)
	numberLine  = regexp.MustCompile(`^\s*(\d+)[.)]\s+(.*)$`)
	blankRun    = regexp.MustCompile(`\n\s*\n`)
	marks       = strings.NewReplacer("**", "", "__", "", "`", "", "*", "")
)

// Blocks splits a page's markdown at blank lines. A heading that opens the
// page is dropped, since the page shows its section as the title. List items
// parted by blank lines are blocks of their own, each asked about apart; an
// ordered one keeps its number.
func Blocks(markdown string) []Block {
	var blocks []Block
	n := 0
	add := func(b Block) {
		if b.Kind != "h" {
			n++
			b.N = n
		}
		blocks = append(blocks, b)
	}
	for index, chunk := range blankRun.Split(strings.TrimSpace(markdown), -1) {
		lines := strings.Split(strings.TrimSpace(chunk), "\n")
		if len(lines) == 1 && lines[0] == "" {
			continue
		}
		if match := headingLine.FindStringSubmatch(lines[0]); match != nil {
			if index > 0 {
				blocks = append(blocks, Block{Kind: "h", HTML: template.HTML(telegram.InlineHTML(match[1]))})
			}
			lines = lines[1:]
			if len(lines) == 0 {
				continue
			}
		}
		kind, items, plain := list(lines)
		if kind != "" {
			start := 0
			if kind == "ol" {
				start, _ = strconv.Atoi(numberLine.FindStringSubmatch(lines[0])[1])
			}
			add(Block{Kind: kind, Items: items, Text: plain, Start: start})
			continue
		}
		text := strings.Join(lines, " ")
		add(Block{Kind: "p", HTML: template.HTML(telegram.InlineHTML(text)), Text: marks.Replace(text)})
	}
	return blocks
}

// list reads lines that are all items of one kind of list.
func list(lines []string) (string, []template.HTML, string) {
	kind := ""
	var items []template.HTML
	var plain []string
	for _, line := range lines {
		lineKind, body := "", ""
		if match := bulletLine.FindStringSubmatch(line); match != nil {
			lineKind, body = "ul", match[1]
		} else if match := numberLine.FindStringSubmatch(line); match != nil {
			lineKind, body = "ol", match[2]
		}
		if lineKind == "" && kind != "" && strings.HasPrefix(line, " ") {
			// A wrapped item continues on an indented line.
			items[len(items)-1] += template.HTML(" " + telegram.InlineHTML(strings.TrimSpace(line)))
			continue
		}
		if lineKind == "" || (kind != "" && lineKind != kind) {
			return "", nil, ""
		}
		kind = lineKind
		items = append(items, template.HTML(telegram.InlineHTML(body)))
		plain = append(plain, marks.Replace(body))
	}
	return kind, items, strings.Join(plain, " ")
}
