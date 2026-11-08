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
