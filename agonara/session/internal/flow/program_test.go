package flow

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
)

// treeReader answers each entity by ID and is safe for concurrent reads.
type treeReader struct {
	mu       sync.Mutex
	entities map[string]agonara.Entity
	failOn   string
	fakeReader
}

func (r *treeReader) Entity(_ context.Context, id string) (agonara.Entity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if id == r.failOn {
		return agonara.Entity{}, errors.New("GET /navigation/entities failed (HTTP 500): request rejected")
	}
	return r.entities[id], nil
}

func newTree() *treeReader {
	r := &treeReader{entities: map[string]agonara.Entity{}}
	r.programs = []agonara.Program{{ProgramID: "p", Title: "Agents", Description: "From a call to an agent."}}
	r.navigation = agonara.Navigation{
		Topics: []agonara.Node{
			{EntityID: "t1", AcceptedKind: "topic", Title: "What an agent is"},
			{EntityID: "t2", AcceptedKind: "topic", Title: "Checks"},
		},
		UngroupedMaterials: []agonara.Node{{EntityID: "m9", AcceptedKind: material, Title: "Glossary"}},
	}
	t1 := agonara.Entity{EntityID: "t1"}
	t1.Relationships.Outgoing = links("c1", "concept", "Loop", "m1", material, "Lecture", "c2", "concept", "Tools")
	r.entities["t1"] = t1
	r.entities["t2"] = agonara.Entity{EntityID: "t2"}
	return r
}

func TestProgramNestsEachTopicsConceptsAndMaterialsInOrder(t *testing.T) {
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
	r := newTree()
	r.failOn = "t2"
	if _, err := (Flow{Reader: r}).Program(context.Background(), "p"); err == nil {
		t.Fatal("want an error")
	}
}
