package telegram

import (
	"reflect"
	"strings"
	"testing"
)

func n(value int) *int { return &value }

func equal(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got: %#v\nwant: %#v", got, want)
	}
}

func link(data, label string) string {
	return `<tg-button type="callback_data" style="link" data="` + data + `">` + label + `</tg-button>`
}

func button(data, label string) string {
	return `<tg-button type="callback_data" data="` + data + `">` + label + `</tg-button>`
}

func labels(k Keyboard) [][]string {
	var out [][]string
	for _, row := range k.InlineKeyboard {
		var texts []string
		for _, b := range row {
			texts = append(texts, b.Text)
		}
		out = append(out, texts)
	}
	return out
}

func TestPlainScreenRendersTitleBodyAndLists(t *testing.T) {
	t.Parallel()
	text, _ := Render(View{Title: "Тема 3", Body: "About <ethics> & more.", Lists: []List{
		{Heading: "Materials", Entries: []Entry{{ID: "open_1", Label: "Лекция"}}},
		{Heading: "Concepts", Entries: []Entry{{ID: "open_0", N: n(1), Label: "Власть"}, {ID: "open_2", N: n(2), Label: "Секреты"}}},
	}}, nil, 1)
	equal(t, text, "<b>Тема 3</b>\n\nAbout &lt;ethics&gt; &amp; more.\n\n<b>Materials</b>\n📖 Read: Лекция\n\n<b>Concepts</b>\n1. Власть\n2. Секреты")
	text, _ = Render(View{Title: "Programs", Empty: "No programs."}, nil, 1)
	equal(t, text, "<b>Programs</b>\n\nNo programs.")
}

func TestKeyboardRows(t *testing.T) {
	t.Parallel()
	var actions []Action
	for i := 0; i < 7; i++ {
		actions = append(actions, Action{ID: "open_" + string(rune('0'+i)), Kind: "item", Label: string(rune('1' + i))})
	}
	actions = append(actions,
		Action{ID: "open_7", Kind: "material", Label: "Тема 3. Этические проблемы в деятельности практического психолога"},
		Action{ID: "prev", Kind: "page", Label: "◀ Prev"}, Action{ID: "next", Kind: "page", Label: "Next ▶"},
		Action{ID: "back", Kind: "nav", Label: "◀ Back"}, Action{ID: "programs", Kind: "nav", Label: "Programs"})
	k := MakeKeyboard(actions, 4)
	equal(t, labels(k), [][]string{
		{"📖 Read: Тема 3. Этические проблемы…"}, {"1", "2", "3", "4", "5"}, {"6", "7"}, {"◀ Prev", "Next ▶"}, {"◀ Back", "Programs"},
	})
	equal(t, k.InlineKeyboard[0][0].CallbackData, "4:open_7")
	equal(t, MakeKeyboard(nil, 1), Keyboard{InlineKeyboard: [][]Button{}})
}

func TestRichScreenMakesNamesTappable(t *testing.T) {
	t.Parallel()
	html := RenderRich(View{Title: "Тема 3", Body: "About <ethics>\n& more.", Lists: []List{
		{Heading: "Materials", Entries: []Entry{{ID: "open_1", Label: "Лекция"}}},
		{Heading: "Concepts", Entries: []Entry{{ID: "open_0", N: n(1), Label: "Власть"}, {ID: "open_2", N: n(2), Label: "Секреты"}}},
	}}, []Action{
		{ID: "open_0", Kind: "item", Label: "1"}, {ID: "open_1", Kind: "material", Label: "Лекция"}, {ID: "open_2", Kind: "item", Label: "2"},
		{ID: "back", Kind: "nav", Label: "◀ Back"}, {ID: "programs", Kind: "nav", Label: "Programs"},
	}, 5)
	equal(t, html, "<h2>Тема 3</h2><p>About &lt;ethics&gt;<br>&amp; more.</p>"+
		"<h3>Materials</h3><ul><li>📖 "+link("5:open_1", "Лекция")+"</li></ul>"+
		"<h3>Concepts</h3><ol><li>"+link("5:open_0", "Власть")+"</li><li>"+link("5:open_2", "Секреты")+"</li></ol>"+
		"<tg-button-row>"+button("5:back", "◀ Back")+button("5:programs", "Programs")+"</tg-button-row>")
	equal(t, RenderRich(View{Title: "Programs", Lists: []List{{Entries: []Entry{{ID: "open_0", N: n(1), Label: "A"}}}}}, nil, 1),
		"<h2>Programs</h2><ol><li>A</li></ol>")
}

func TestLecturePageStartsWithWhereItIs(t *testing.T) {
	t.Parallel()
	actions := []Action{{ID: "next", Kind: "page", Label: "Next ▶"}, {ID: "contents", Kind: "page", Label: "☰ Contents"}, {ID: "back", Kind: "nav", Label: "◀ Back"}}
	view := View{Title: "Notes", Markdown: "Text.", Reading: &ReadingPosition{Page: 3, Pages: 9, Section: n(2), Heading: "B", Offset: 1, Length: 4}}
	equal(t, RenderRich(view, actions, 1), "<p><i>📖 §2 B · 2/4</i></p><p>Text.</p><tg-button-row>"+button("1:next", "Next ▶")+
		button("1:contents", "☰ Contents")+"</tg-button-row><tg-button-row>"+button("1:back", "◀ Back")+"</tg-button-row>")
	text, _ := Render(view, actions, 1)
	if !strings.HasPrefix(text, "📖 <b>Notes</b>\n<i>§2 B · 2/4</i>") {
		t.Fatal(text)
	}
	intro := View{Title: "Notes", Markdown: "Text.", Reading: &ReadingPosition{Page: 0, Pages: 9, Offset: 0, Length: 2}}
	if !strings.HasPrefix(RenderRich(intro, nil, 1), "<p><i>📖 Notes · Intro · 1/2</i></p>") {
		t.Fatal(RenderRich(intro, nil, 1))
	}
	single := View{Title: "Notes", Markdown: "Text.", Reading: &ReadingPosition{Pages: 1, Length: 1}}
	equal(t, RenderRich(single, nil, 1), "<h2>📖 Notes</h2><p>Text.</p>")
}

func TestPositionLabel(t *testing.T) {
	t.Parallel()
	equal(t, PositionLabel(ReadingPosition{Length: 1}), "Intro")
	equal(t, PositionLabel(ReadingPosition{Section: n(3), Heading: "C", Length: 1}), "§3 C")
	equal(t, PositionLabel(ReadingPosition{Section: n(3), Heading: "C", Offset: 4, Length: 6}), "§3 C · 5/6")
}

func TestContentsPage(t *testing.T) {
	t.Parallel()
	html := RenderRich(View{Title: "Notes", Contents: []ContentsEntry{
		{Page: 0, Label: "Intro"}, {Page: 2, N: n(1), Label: "A", Current: true},
	}}, []Action{{ID: "sec_0", Kind: "section"}, {ID: "sec_2", Kind: "section"}, {ID: "read", Kind: "page", Label: "📖 Continue reading"}}, 4)
	equal(t, html, "<h2>📖 Notes</h2><h3>Contents</h3><ul><li>"+link("4:sec_0", "Intro")+"</li><li>▸ §1 "+link("4:sec_2", "A")+
		"</li></ul><tg-button-row>"+button("4:read", "📖 Continue reading")+"</tg-button-row>")
}

func TestMarkdownToHTML(t *testing.T) {
	t.Parallel()
	equal(t, MarkdownToHTML(strings.Join([]string{
		"## Цель **важно**", "Text with **bold**, __bold__, *italic* and `code` & <tag>.",
		"- one", "  * two", "---", "[Link](https://example.com) stays as text.", "2 * 3 * 4 is not italic.",
	}, "\n")), strings.Join([]string{
		"<b>Цель важно</b>", "Text with <b>bold</b>, <b>bold</b>, <i>italic</i> and <code>code</code> &amp; &lt;tag&gt;.",
		"• one", "  • two", "———", "Link stays as text.", "2 * 3 * 4 is not italic.",
	}, "\n"))
	equal(t, MarkdownToHTML("**open\nclose**"), "**open\nclose**")
}

func TestMarkdownToRich(t *testing.T) {
	t.Parallel()
	equal(t, MarkdownToRich(strings.Join([]string{
		"# Lecture", "Goal: **know** it.", "1. one", "2. two", "## Part A", "Line one\nline two", "- x\n- y", "---", "Text & <tag>.",
	}, "\n\n")), "<h3>Lecture</h3><p>Goal: <b>know</b> it.</p><ol><li>one</li><li>two</li></ol>"+
		"<h3>Part A</h3><p>Line one<br>line two</p><ul><li>x</li><li>y</li></ul><hr><p>Text &amp; &lt;tag&gt;.</p>")
	equal(t, MarkdownToRich("Intro:\n- a\n- b\nAfter."), "<p>Intro:</p><ul><li>a</li><li>b</li></ul><p>After.</p>")
}

func TestParseCallback(t *testing.T) {
	t.Parallel()
	step, action, ok := ParseCallback("12:open_3")
	equal(t, []any{step, action, ok}, []any{12, "open_3", true})
	for _, data := range []string{"12:open-3", ""} {
		if _, _, ok := ParseCallback(data); ok {
			t.Fatal(data)
		}
	}
}

func TestSplitTextLosesNothing(t *testing.T) {
	t.Parallel()
	text := strings.Repeat("x", TextLimit*2+5)
	chunks := SplitText(text, TextLimit)
	equal(t, strings.Join(chunks, ""), text)
	for _, chunk := range chunks {
		if len([]rune(chunk)) > TextLimit {
			t.Fatal("chunk over limit")
		}
	}
}
