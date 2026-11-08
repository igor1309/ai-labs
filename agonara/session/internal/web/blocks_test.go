package web

import (
	"html/template"
	"reflect"
	"testing"
)

func TestBlocksNumbersParagraphsAndListItemsAndDropsTheOpeningHeading(t *testing.T) {
	t.Parallel()
	got := Blocks("## Цикл агента\n\nАгент **сам** выбирает\nследующий шаг.\n\n- думать\n\n- делать\n\n### Итог\n\n1. a\n2. b <c>\n\n3. later")
	want := []Block{
		{Kind: "p", N: 1, HTML: "Агент <b>сам</b> выбирает следующий шаг.", Text: "Агент сам выбирает следующий шаг."},
		{Kind: "ul", N: 2, Items: []template.HTML{"думать"}, Text: "думать"},
		{Kind: "ul", N: 3, Items: []template.HTML{"делать"}, Text: "делать"},
		{Kind: "h", HTML: "Итог"},
		{Kind: "ol", N: 4, Items: []template.HTML{"a", "b &lt;c&gt;"}, Text: "a b <c>", Start: 1},
		{Kind: "ol", N: 5, Items: []template.HTML{"later"}, Text: "later", Start: 3},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v\nwant %#v", got, want)
	}
}

func TestBlocksKeepsAMixedChunkAsOneParagraph(t *testing.T) {
	t.Parallel()
	got := Blocks("Intro:\n- a")
	if len(got) != 1 || got[0].Kind != "p" || got[0].HTML != "Intro: - a" {
		t.Fatalf("got %#v", got)
	}
}

func TestSourceBlocksFormatSuppliedFragmentsWithoutSplittingOrMatchingText(t *testing.T) {
	t.Parallel()
	got := sourceBlocks([]SourceBlock{
		{Markdown: "# Title"},
		{Markdown: "Same **text**.\n\nStill this fragment.", Reference: "ref-90"},
		{Markdown: "### <Heading>"},
		{Markdown: "Same **text**.\n\nStill this fragment.", Reference: "ref-2"},
		{Markdown: "# Kept as paragraph source", Reference: "ref-heading-text"},
		{Markdown: "- one\n- two <unsafe>", Reference: "ref-list"},
	})
	want := []Block{
		{Kind: "p", N: 1, Reference: "ref-90", HTML: "Same <b>text</b>.  Still this fragment.", Text: "Same text.  Still this fragment."},
		{Kind: "h", HTML: "&lt;Heading&gt;"},
		{Kind: "p", N: 2, Reference: "ref-2", HTML: "Same <b>text</b>.  Still this fragment.", Text: "Same text.  Still this fragment."},
		{Kind: "p", N: 3, Reference: "ref-heading-text", HTML: "# Kept as paragraph source", Text: "# Kept as paragraph source"},
		{Kind: "ul", N: 4, Reference: "ref-list", Items: []template.HTML{"one", "two &lt;unsafe&gt;"}, Text: "one two <unsafe>"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v\nwant %#v", got, want)
	}
}
