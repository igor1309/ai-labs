// Package telegram draws session screens for Telegram on a phone and handles
// the bot's updates.
package telegram

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

const (
	// TextLimit is Telegram's limit for one plain message.
	TextLimit = 4096
	// RichTextLimit is Telegram's limit for one rich message.
	RichTextLimit      = 32768
	numbersPerRow      = 5
	materialLabelLimit = 28
)

// Button is an inline keyboard button.
type Button struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data"`
}

// Keyboard is an inline keyboard.
type Keyboard struct {
	InlineKeyboard [][]Button `json:"inline_keyboard"`
}

// PositionLabel says where a page is in its lecture: "§2 Section · 3/6".
func PositionLabel(position flow.Position) string {
	where := "Intro"
	if position.Section != nil {
		where = fmt.Sprintf("§%d %s", *position.Section, position.Label)
	}
	if position.Count > 1 {
		return fmt.Sprintf("%s · %d/%d", where, position.Index+1, position.Count)
	}
	return where
}

func paged(view flow.View) bool {
	return view.Position != nil && view.Page != nil && view.Page.Count > 1
}

func contentsLine(entry flow.ContentsEntry, label string) string {
	line := ""
	if entry.Current {
		line = "▸ "
	}
	if entry.N != nil {
		line += fmt.Sprintf("§%d ", *entry.N)
	}
	return line + label
}

// Render draws a screen in the plain format: HTML text with an inline keyboard.
func Render(view flow.View, actions []flow.Action, step int) (string, Keyboard) {
	var header string
	switch {
	case paged(view):
		header = "📖 <b>" + escape(view.Title) + "</b>\n<i>" + escape(PositionLabel(*view.Position)) + "</i>"
	case view.Page != nil:
		header = fmt.Sprintf("📖 <b>%s</b>\n<i>Page %d of %d</i>", escape(view.Title), view.Page.Index+1, view.Page.Count)
	default:
		header = "<b>" + escape(view.Title) + "</b>"
	}
	parts := []string{header}
	if view.Body != "" {
		parts = append(parts, escape(view.Body))
	}
	if view.Markdown != "" {
		parts = append(parts, MarkdownToHTML(view.Markdown))
	}
	if view.Contents != nil {
		lines := []string{"<b>Contents</b>"}
		for _, entry := range view.Contents {
			lines = append(lines, contentsLine(entry, escape(entry.Label)))
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}
	for _, list := range view.Lists {
		var lines []string
		if list.Heading != "" {
			lines = append(lines, "<b>"+escape(list.Heading)+"</b>")
		}
		for _, entry := range list.Entries {
			if entry.N == nil {
				lines = append(lines, "📖 Read: "+escape(entry.Label))
			} else {
				lines = append(lines, fmt.Sprintf("%d. %s", *entry.N, escape(entry.Label)))
			}
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}
	if view.Empty != "" {
		parts = append(parts, escape(view.Empty))
	}
	return strings.Join(parts, "\n\n"), MakeKeyboard(actions, step)
}

// MakeKeyboard lays out buttons: one row per material, numbers five to a row,
// one row per section, then paging, then navigation.
func MakeKeyboard(actions []flow.Action, step int) Keyboard {
	button := func(action flow.Action, text string) Button {
		return Button{Text: text, CallbackData: fmt.Sprintf("%d:%s", step, action.ID)}
	}
	of := func(kind string) []flow.Action {
		var out []flow.Action
		for _, action := range actions {
			if action.Kind == kind {
				out = append(out, action)
			}
		}
		return out
	}
	rows := [][]Button{}
	for _, action := range of("material") {
		rows = append(rows, []Button{button(action, "📖 Read: "+shorten(action.Label, materialLabelLimit))})
	}
	items := of("item")
	for start := 0; start < len(items); start += numbersPerRow {
		var row []Button
		for _, action := range items[start:min(start+numbersPerRow, len(items))] {
			row = append(row, button(action, action.Label))
		}
		rows = append(rows, row)
	}
	for _, action := range of("section") {
		rows = append(rows, []Button{button(action, "§ "+shorten(action.Label, materialLabelLimit))})
	}
	for _, kind := range []string{"page", "nav"} {
		var row []Button
		for _, action := range of(kind) {
			row = append(row, button(action, action.Label))
		}
		if len(row) > 0 {
			rows = append(rows, row)
		}
	}
	return Keyboard{InlineKeyboard: rows}
}

// RenderRich draws a screen as one rich message (Bot API 10.1): names
// tappable where they are written, paging and navigation as button rows at
// the end.
func RenderRich(view flow.View, actions []flow.Action, step int) string {
	ids := map[string]bool{}
	for _, action := range actions {
		ids[action.ID] = true
	}
	tap := func(id, label string) string {
		if !ids[id] {
			return escape(label)
		}
		return fmt.Sprintf(`<tg-button type="callback_data" style="link" data="%d:%s">%s</tg-button>`, step, id, escape(label))
	}
	var parts []string
	if paged(view) {
		lead := ""
		if view.Position.Section == nil {
			lead = view.Title + " · "
		}
		parts = append(parts, "<p><i>📖 "+escape(lead)+escape(PositionLabel(*view.Position))+"</i></p>")
	} else {
		mark := ""
		if view.Page != nil || view.Contents != nil {
			mark = "📖 "
		}
		parts = append(parts, "<h2>"+mark+escape(view.Title)+"</h2>")
	}
	if view.Body != "" {
		parts = append(parts, paragraph(escape(view.Body)))
	}
	if view.Markdown != "" {
		parts = append(parts, MarkdownToRich(view.Markdown))
	}
	if view.Contents != nil {
		var items strings.Builder
		for _, entry := range view.Contents {
			items.WriteString("<li>" + contentsLine(entry, tap("sec_"+strconv.Itoa(entry.Page), entry.Label)) + "</li>")
		}
		parts = append(parts, "<h3>Contents</h3><ul>"+items.String()+"</ul>")
	}
	for _, list := range view.Lists {
		materials := true
		for _, entry := range list.Entries {
			materials = materials && entry.N == nil
		}
		var items strings.Builder
		for _, entry := range list.Entries {
			mark := ""
			if materials {
				mark = "📖 "
			}
			items.WriteString("<li>" + mark + tap("open_"+strconv.Itoa(entry.Index), entry.Label) + "</li>")
		}
		if list.Heading != "" {
			parts = append(parts, "<h3>"+escape(list.Heading)+"</h3>")
		}
		if materials {
			parts = append(parts, "<ul>"+items.String()+"</ul>")
		} else {
			parts = append(parts, "<ol>"+items.String()+"</ol>")
		}
	}
	if view.Empty != "" {
		parts = append(parts, paragraph(escape(view.Empty)))
	}
	for _, kind := range []string{"page", "nav"} {
		var row strings.Builder
		for _, action := range actions {
			if action.Kind == kind {
				fmt.Fprintf(&row, `<tg-button type="callback_data" data="%d:%s">%s</tg-button>`, step, action.ID, escape(action.Label))
			}
		}
		if row.Len() > 0 {
			parts = append(parts, "<tg-button-row>"+row.String()+"</tg-button-row>")
		}
	}
	return strings.Join(parts, "")
}

var callbackPattern = regexp.MustCompile(`^(\d+):(\w+)$`)

// ParseCallback reads a button's step and action.
func ParseCallback(data string) (step int, actionID string, ok bool) {
	match := callbackPattern.FindStringSubmatch(data)
	if match == nil {
		return 0, "", false
	}
	step, err := strconv.Atoi(match[1])
	return step, match[2], err == nil
}

// SplitText cuts text into messages within the limit, at newlines where possible.
func SplitText(text string, limit int) []string {
	var chunks []string
	rest := []rune(text)
	for len(rest) > limit {
		cut := -1
		for index := limit; index > 0; index-- {
			if index < len(rest) && rest[index] == '\n' {
				cut = index
				break
			}
		}
		if cut > 0 {
			chunks = append(chunks, string(rest[:cut]))
			rest = rest[cut+1:]
		} else {
			chunks = append(chunks, string(rest[:limit]))
			rest = rest[limit:]
		}
	}
	return append(chunks, string(rest))
}

func shorten(text string, limit int) string {
	if utf8.RuneCountInString(text) <= limit {
		return text
	}
	return strings.TrimRight(string([]rune(text)[:limit-1]), " \t\n") + "…"
}
