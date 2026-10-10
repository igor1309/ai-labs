package app

import (
	"context"
	"fmt"
	"sort"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// allKinds is every kind of definition a snapshot covers, in a fixed order.
// Each call returns a new slice.
func allKinds() []definition.Kind {
	return []definition.Kind{
		definition.KindService, definition.KindRuntime, definition.KindAgent,
		definition.KindVerify, definition.KindPrompt,
		definition.KindSkill, definition.KindBrief, definition.KindProcess, definition.KindSchema, definition.KindWorkflow,
		definition.KindWorkspace, definition.KindBlocks,
	}
}

// SnapshotSource is what a snapshot reads and what it gives back: the
// definition documents and their origin, and the layers they are read
// from. Read reads a document as a call reads it; ReadListed one as the
// settings list it, a prompt never from a folder a layer.yaml lists
// (ADR-028 rule 9), and any other kind as Read.
type SnapshotSource interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	ReadListed(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
	Layers(ctx context.Context) []definition.LayerDir
}

type snapshotRead struct {
	doc definition.Document
	err error
}

type snapshotList struct {
	names []string
	err   error
}

// snapshot is a SnapshotSource frozen in memory: what was read, and each
// error the read gave, replayed as it was.
type snapshot struct {
	reads map[definition.Kind]map[string]snapshotRead
	// listed are the prompts as the settings list them, apart from reads,
	// which holds a prompt as a call reads it (ADR-028 rule 9).
	listed map[string]snapshotRead
	lists  map[definition.Kind]snapshotList
	layers []definition.LayerDir
}

// Snapshot reads every kind's List and every listed document once (the
// service document for KindService, as Checker does) and returns them as an
// immutable source. Read and List errors are kept and returned again, so a
// check against the snapshot reports what a check against src would. Nothing
// that reads the snapshot touches src afterwards, so one operation can check
// settings and use exactly what it checked. A name that was not listed is
// not found, except the verification and the prompts a process names, and
// the skills a process or an agent names: their reads are kept too, so the
// refusal of a call or view that lacks one says where it was expected
// (check lets a missing verification pass, ADR-010 rule 4). One that is
// found there after all, written since the list, is added to the list, so
// check checks what the call uses.
//
// The prompts a valid process names are read with Read; other listed
// prompts with ReadListed. Only the read the check uses is frozen: an
// inventory read of a named prompt could open a file the call replaces
// with a listed folder's prompt, including a FIFO (ADR-028 rules 6 and 9).
// Read gives the named prompts, and ReadListed the remaining inventory;
// a named prompt is not added to the list, which holds no folder's, and
// check reads it all the same.
func Snapshot(ctx context.Context, src SnapshotSource) SnapshotSource {
	s := &snapshot{
		reads:  map[definition.Kind]map[string]snapshotRead{},
		listed: map[string]snapshotRead{},
		lists:  map[definition.Kind]snapshotList{},
		layers: cloneLayers(src.Layers(ctx)),
	}
	for _, kind := range allKinds() {
		s.reads[kind] = map[string]snapshotRead{}
		names := []string{"service"}
		if kind != definition.KindService {
			listed, err := src.List(ctx, kind)
			s.lists[kind] = snapshotList{names: append([]string(nil), listed...), err: err}
			if err != nil {
				continue
			}
			names = listed
		}
		for _, name := range names {
			if kind == definition.KindPrompt {
				// Wait until process references are known before deciding
				// which prompt read the check needs.
				continue
			}
			doc, err := src.Read(ctx, kind, name)
			s.reads[kind][name] = snapshotRead{doc: cloneDocument(doc), err: err}
		}
	}
	named := func(kind definition.Kind, name string) {
		if _, ok := s.reads[kind][name]; ok || name == "" {
			return
		}
		doc, err := src.Read(ctx, kind, name)
		s.reads[kind][name] = snapshotRead{doc: cloneDocument(doc), err: err}
		if list := s.lists[kind]; err == nil && list.err == nil && kind != definition.KindPrompt {
			list.names = append(list.names, name)
			sort.Strings(list.names)
			s.lists[kind] = list
		}
	}
	for _, read := range s.reads[definition.KindProcess] {
		if read.err != nil {
			continue
		}
		process, err := definition.ParseProcess(read.doc)
		named(definition.KindVerify, process.VerifyName)
		if err == nil {
			for _, name := range process.Prompts() {
				named(definition.KindPrompt, name)
			}
		}
		for _, name := range process.Skills {
			named(definition.KindSkill, name)
		}
	}
	for _, name := range s.lists[definition.KindPrompt].names {
		if _, referenced := s.reads[definition.KindPrompt][name]; referenced {
			continue
		}
		doc, err := src.ReadListed(ctx, definition.KindPrompt, name)
		s.listed[name] = snapshotRead{doc: cloneDocument(doc), err: err}
	}
	for _, read := range s.reads[definition.KindAgent] {
		if read.err != nil {
			continue
		}
		agent, _ := definition.ParseAgent(read.doc)
		for _, name := range agent.Skills {
			named(definition.KindSkill, name)
		}
	}
	return s
}

func cloneDocument(doc definition.Document) definition.Document {
	doc.Bytes = append([]byte(nil), doc.Bytes...)
	if doc.Texts != nil {
		doc.Texts = append([]definition.LayerText(nil), doc.Texts...)
		for i, text := range doc.Texts {
			doc.Texts[i].Bytes = append([]byte(nil), text.Bytes...)
			if text.File.Fields != nil {
				doc.Texts[i].File.Fields = append([]string{}, text.File.Fields...)
			}
		}
	}
	if doc.Source.Layers != nil {
		doc.Source.Layers = append([]definition.LayerFile(nil), doc.Source.Layers...)
		for i, layer := range doc.Source.Layers {
			if layer.Fields != nil {
				doc.Source.Layers[i].Fields = append([]string{}, layer.Fields...)
			}
		}
	}
	return doc
}

func cloneLayers(layers []definition.LayerDir) []definition.LayerDir {
	if layers == nil {
		return nil
	}
	cloned := append([]definition.LayerDir(nil), layers...)
	for i, layer := range cloned {
		cloned[i].Invalid = append([]definition.LayerProblem(nil), layer.Invalid...)
	}
	return cloned
}

func (s *snapshot) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	read, ok := s.reads[kind][name]
	if !ok {
		return definition.Document{}, fmt.Errorf("not found in the settings snapshot")
	}
	return cloneDocument(read.doc), read.err
}

// ReadListed gives an unreferenced inventory prompt as the settings list
// it, and any other kind as Read does. Referenced prompts are frozen only
// as Read returns them, because that is what the check and call use.
func (s *snapshot) ReadListed(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	if kind != definition.KindPrompt {
		return s.Read(ctx, kind, name)
	}
	read, ok := s.listed[name]
	if !ok {
		return definition.Document{}, fmt.Errorf("not found in the settings snapshot")
	}
	return cloneDocument(read.doc), read.err
}

func (s *snapshot) Layers(context.Context) []definition.LayerDir { return cloneLayers(s.layers) }

func (s *snapshot) List(_ context.Context, kind definition.Kind) ([]string, error) {
	list, ok := s.lists[kind]
	if !ok {
		return nil, nil
	}
	return append([]string(nil), list.names...), list.err
}
