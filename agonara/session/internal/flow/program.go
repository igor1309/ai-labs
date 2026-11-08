package flow

import (
	"context"
	"sync"
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
		if p.ID == programID {
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
		program.Courses[index].Topic = topic
		wg.Add(1)
		go func() {
			defer wg.Done()
			limit <- struct{}{}
			defer func() { <-limit }()
			entity, err := f.Reader.Entity(ctx, topic.ID)
			if err != nil {
				errs[index] = err
				return
			}
			course := &program.Courses[index]
			course.Concepts, course.Materials = []Item{}, []Item{}
			for _, link := range entity.Children {
				switch link.Kind {
				case material:
					course.Materials = append(course.Materials, link)
				case "concept":
					course.Concepts = append(course.Concepts, link)
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
	for _, node := range navigation.Concepts {
		program.Concepts = append(program.Concepts, node)
	}
	for _, node := range navigation.Materials {
		program.Materials = append(program.Materials, node)
	}
	return program, nil
}

// IsMaterial says whether an item is something to read.
func IsMaterial(it Item) bool { return it.Kind == material }
