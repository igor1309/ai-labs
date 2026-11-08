package web

import (
	"testing"
)

func course(id, title string, concepts int, materials ...Item) Course {
	return Course{Topic: Item{ID: id, Title: title}, ConceptCount: concepts, Materials: materials}
}

func TestOutlineSortsByTheTitlesNumberAndGivesEachMaterialOneHome(t *testing.T) {
	t.Parallel()
	lecture := Item{ID: "m3", Title: "Тема 3. Этические проблемы"}
	program := &Program{Courses: []Course{
		course("t2", "Тема 2. Ценности", 9),
		course("t3", "Тема 3. Этические проблемы", 20, lecture),
		course("t10", "Тема 10. Итоги", 1),
		course("mod", "Модуль 1. Введение в профессию", 2, lecture, Item{ID: "m0", Title: "Обзор модуля"}, Item{ID: "m2", Title: "Тема 2. Ценности"}),
		course("t1", "Тема 1. Общая этика", 12),
		course("x", "Глоссарий", 0),
	}}
	o := newOutline(program)
	var order []string
	for _, r := range o.Topics {
		order = append(order, r.ID)
	}
	if got, want := order, []string{"t1", "t2", "t3", "t10", "x"}; len(got) != len(want) || got[0] != want[0] || got[2] != want[2] || got[3] != want[3] || got[4] != want[4] {
		t.Fatalf("topics in order %v, want %v", got, want)
	}
	if len(o.Modules) != 1 || o.Modules[0].Label != "Модуль 1" || o.Modules[0].Name != "Введение в профессию" {
		t.Fatalf("module %+v", o.Modules)
	}
	if m := o.Modules[0].Materials; len(m) != 1 || m[0].ID != "m0" {
		t.Fatalf("the module keeps only what no topic lists: %+v", m)
	}
	if m := o.Topics[2].Materials; len(m) != 1 || m[0].Title != "" {
		t.Fatalf("a lecture named like its topic prints no title: %+v", m)
	}
	if m := o.Topics[1].Materials; len(m) != 1 || m[0].ID != "m2" || m[0].Title != "" {
		t.Fatalf("a module's lecture named for Тема 2 moves to Тема 2: %+v", m)
	}
	if o.Rows != 6 || o.ConceptCount != 44 || o.WithMaterials != 3 {
		t.Fatalf("tally %d %d %d", o.Rows, o.ConceptCount, o.WithMaterials)
	}
	if home := o.home("m3"); home == nil || home.ID != "t3" {
		t.Fatalf("home of m3: %+v", home)
	}
}

func TestResumeLabelUsesTopicBeforeModulePlacement(t *testing.T) {
	t.Parallel()
	place := Place{Title: "Lecture", Course: "Модуль 1. Общий", Courses: []Item{{Title: "Модуль 1. Общий"}, {Title: "Тема 3. Этика"}}, Position: &Position{Section: intPtr(2), Index: 1, Count: 4}}
	if got := place.Where(); got != "Тема 3 · §2 · 2/4" {
		t.Fatal(got)
	}
	place.Courses = nil
	place.Title = "Тема 2. Ценности"
	if got := place.Where(); got != "Тема 2 · §2 · 2/4" {
		t.Fatal(got)
	}
}
