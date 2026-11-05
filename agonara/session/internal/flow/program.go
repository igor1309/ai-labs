package flow

import (
	"context"
	"sync"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
)

// Course is a program's topic with the concepts and materials it links to.
type Course struct {
	Topic     Item
	Concepts  []Item
	Materials []Item
}

// Program is a program laid out by course: its topics in order, each with its
// own concepts and materials, then what belongs to no topic.
type Program struct {
	ID, Title, Description string
	Courses                []Course
	Concepts, Materials    []Item // ungrouped
}

// Program reads a program as courses. Navigation lists only the topics, so
// each topic is read too, four at a time.
func (f Flow) Program(ctx context.Context, programID string) (*Program, error) {
	programs, err := f.Reader.ListPrograms(ctx)
	if err != nil {
		return nil, err
	}
	program := &Program{ID: programID}
	for _, p := range programs {
		if p.ProgramID == programID {
			program.Title, program.Description = p.Title, p.Description
		}
	}
	navigation, err := f.Reader.Navigation(ctx, programID)
	if err != nil {
		return nil, err
	}
	program.Courses = make([]Course, len(navigation.Topics))
	errs := make([]error, len(navigation.Topics))
	var wg sync.WaitGroup
	limit := make(chan struct{}, 4)
	for index, topic := range navigation.Topics {
		program.Courses[index].Topic = item(topic)
		wg.Add(1)
		go func() {
			defer wg.Done()
			limit <- struct{}{}
			defer func() { <-limit }()
			entity, err := f.Reader.Entity(ctx, topic.EntityID)
			if err != nil {
				errs[index] = err
				return
			}
			course := &program.Courses[index]
			course.Concepts, course.Materials = []Item{}, []Item{}
			for _, link := range entity.Relationships.Outgoing {
				linked := Item{ID: link.ToEntityID, Title: link.ToTitle, Kind: link.ToKind}
				switch link.ToKind {
				case material:
					course.Materials = append(course.Materials, linked)
				case "concept":
					course.Concepts = append(course.Concepts, linked)
				}
			}
		}()
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}
	for _, node := range navigation.UngroupedConcepts {
		program.Concepts = append(program.Concepts, item(node))
	}
	for _, node := range navigation.UngroupedMaterials {
		program.Materials = append(program.Materials, item(node))
	}
	return program, nil
}

func item(node agonara.Node) Item {
	return Item{ID: node.EntityID, Title: node.Title, Kind: node.AcceptedKind}
}

// IsMaterial says whether an item is something to read.
func IsMaterial(it Item) bool { return it.Kind == material }
