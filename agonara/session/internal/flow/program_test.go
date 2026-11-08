package flow

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"
)

// treeReader answers each entity by ID and is safe for concurrent reads.
type treeReader struct {
	mu       sync.Mutex
	entities map[string]Entity
	failOn   string
	fakeReader
}

func (r *treeReader) Entity(_ context.Context, id string) (Entity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if id == r.failOn {
		return Entity{}, errors.New("GET /navigation/entities failed (HTTP 500): request rejected")
	}
	return r.entities[id], nil
}

func newTree() *treeReader {
	r := &treeReader{entities: map[string]Entity{}}
	r.programs = []CatalogEntry{{ID: "p", Title: "Agents", Description: "From a call to an agent."}}
	r.navigation = Navigation{
		Topics: []Item{
			{ID: "t1", Kind: "topic", Title: "What an agent is"},
			{ID: "t2", Kind: "topic", Title: "Checks"},
		},
		Materials: []Item{{ID: "m9", Kind: material, Title: "Glossary"}},
	}
	t1 := Entity{ID: "t1"}
	t1.Children = links("c1", "concept", "Loop", "m1", material, "Lecture", "c2", "concept", "Tools")
	r.entities["t1"] = t1
	r.entities["t2"] = Entity{ID: "t2"}
	return r
}

func TestProgramNestsEachTopicsConceptsAndMaterialsInOrder(t *testing.T) {
	t.Parallel()
	r := newTree()
	got, err := Flow{Reader: r}.Program(context.Background(), "p")
	if err != nil {
		t.Fatal(err)
	}
	want := &Program{
		ID: "p", Title: "Agents", Description: "From a call to an agent.",
		Courses: []Course{
			{
				Topic:     Item{ID: "t1", Title: "What an agent is", Kind: "topic"},
				Concepts:  []Item{{ID: "c1", Title: "Loop", Kind: "concept"}, {ID: "c2", Title: "Tools", Kind: "concept"}},
				Materials: []Item{{ID: "m1", Title: "Lecture", Kind: material}},
			},
			{Topic: Item{ID: "t2", Title: "Checks", Kind: "topic"}, Concepts: []Item{}, Materials: []Item{}},
		},
		Materials: []Item{{ID: "m9", Title: "Glossary", Kind: material}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

func TestProgramFailsWhenATopicCannotBeRead(t *testing.T) {
	t.Parallel()
	r := newTree()
	r.failOn = "t2"
	if _, err := (Flow{Reader: r}).Program(context.Background(), "p"); err == nil {
		t.Fatal("want an error")
	}
}
