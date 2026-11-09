package telegram

import (
	"regexp"
	"strings"

	"github.com/igor1309/ai-labs/agonara/session/internal/inlinehtml"
)

var (
	headingPattern = regexp.MustCompile(`^#{1,6}\s+(.*)$`)
	rulePattern    = regexp.MustCompile(`^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$`)
	bulletPattern  = regexp.MustCompile(`^(\s*)[-*+]\s+(.*)$`)
	numberPattern  = regexp.MustCompile(`^\s*(\d+)[.)]\s+(.*)$`)
	itemPattern    = regexp.MustCompile(`^[ \t]*(?:[-*+]|\d+[.)])[ \t]+`)
	blankRun       = regexp.MustCompile(`\n{2,}`)
	emphasis       = strings.NewReplacer("**", "", "__", "")
)

// MarkdownToHTML converts markdown to Telegram's HTML line by line, so no tag
// spans a line break and a split at a newline never breaks a tag.
func MarkdownToHTML(markdown string) string {
	lines := strings.Split(markdown, "\n")
	for index, raw := range lines {
		switch {
		case headingPattern.MatchString(raw):
			lines[index] = "<b>" + inline(escape(emphasis.Replace(headingPattern.FindStringSubmatch(raw)[1]))) + "</b>"
		case rulePattern.MatchString(raw):
			lines[index] = "———"
		case bulletPattern.MatchString(raw):
			match := bulletPattern.FindStringSubmatch(raw)
			lines[index] = match[1] + "• " + inline(escape(match[2]))
		default:
			lines[index] = inline(escape(raw))
		}
	}
	return strings.Join(lines, "\n")
}

// MarkdownToRich converts markdown to rich-message HTML: headings become
// subheadings, list runs become lists, and other lines of a paragraph are
// joined with <br>. Nothing is collapsed: a section that opens and closes in a
// tall message moves the chat.
func MarkdownToRich(markdown string) string {
	var out strings.Builder
	for _, block := range blankRun.Split(joinListItems(strings.TrimSpace(markdown)), -1) {
		lines := strings.Split(block, "\n")
		switch {
		case len(lines) == 1 && headingPattern.MatchString(lines[0]):
			out.WriteString("<h3>" + inline(escape(emphasis.Replace(headingPattern.FindStringSubmatch(lines[0])[1]))) + "</h3>")
		case rulePattern.MatchString(block):
			out.WriteString("<hr>")
		default:
			out.WriteString(richBlock(lines))
		}
	}
	return out.String()
}

// Items of one list are often parted by blank lines; keep them one list.
func joinListItems(text string) string {
	lines := strings.Split(text, "\n")
	out := make([]string, 0, len(lines))
	for index := 0; index < len(lines); index++ {
		out = append(out, lines[index])
		if !itemPattern.MatchString(lines[index]) {
			continue
		}
		next := index + 1
		for next < len(lines) && lines[next] == "" {
			next++
		}
		if next > index+1 && next < len(lines) && itemPattern.MatchString(lines[next]) {
			index = next - 1
		}
	}
	return strings.Join(out, "\n")
}

func richBlock(lines []string) string {
	var out strings.Builder
	var text []string
	var tag string
	var items []string
	flush := func() {
		if len(text) > 0 {
			out.WriteString(paragraph(strings.Join(text, "<br>")))
		}
		text = nil
	}
	end := func() {
		if tag != "" {
			out.WriteString("<" + tag + ">" + strings.Join(items, "") + "</" + tag + ">")
		}
		tag, items = "", nil
	}
	for _, raw := range lines {
		var kind, body string
		if match := bulletPattern.FindStringSubmatch(raw); match != nil {
			kind, body = "ul", match[2]
		} else if match := numberPattern.FindStringSubmatch(raw); match != nil {
			kind, body = "ol", match[2]
		}
		if kind == "" {
			end()
			text = append(text, inline(escape(raw)))
			continue
		}
		flush()
		if tag != kind {
			end()
			tag = kind
		}
		items = append(items, "<li>"+inline(escape(body))+"</li>")
	}
	end()
	flush()
	return out.String()
}

func paragraph(html string) string {
	return "<p>" + strings.ReplaceAll(html, "\n", "<br>") + "</p>"
}

func inline(text string) string { return inlinehtml.FromEscaped(text) }
func escape(text string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(text)
}
