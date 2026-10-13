package app

import (
	"context"
	"fmt"
	"sort"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// allKinds is every kind of definition a snapshot covers, in a fixed order.
// Each call returns a new slice.
func allKinds() []document.Kind {
	return []document.Kind{
		document.KindService, document.KindRuntime, document.KindAgent,
		document.KindVerify, document.KindPrompt,
		document.KindSkill, document.KindBrief, document.KindProcess, document.KindSchema, document.KindWorkflow,
		document.KindWorkspace, document.KindBlocks,
	}
}

// SnapshotSource is what a snapshot reads and what it gives back: the
// definition documents and their origin, and the layers they are read
// from. Read reads a document as a call reads it; ReadListed one as the
// settings list it, a prompt never from a folder a layer.yaml lists
// (ADR-028 rule 9), and any other kind as Read.
type SnapshotSource interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	List(ctx context.Context, kind document.Kind) ([]string, error)
	Layers(ctx context.Context) []document.LayerDir
}

type snapshotRead struct {
	doc document.Document
	err error
}

type snapshotList struct {
	names []string
	err   error
}

// snapshot is a SnapshotSource frozen in memory: what was read, and each
// error the read gave, replayed as it was.
type snapshot struct {
	reads map[document.Kind]map[string]snapshotRead
	// listed are the prompts as the settings list them, apart from reads,
	// which holds a prompt as a call reads it (ADR-028 rule 9).
	listed map[string]snapshotRead
	lists  map[document.Kind]snapshotList
	layers []document.LayerDir
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
		reads:  map[document.Kind]map[string]snapshotRead{},
		listed: map[string]snapshotRead{},
		lists:  map[document.Kind]snapshotList{},
		layers: cloneLayers(src.Layers(ctx)),
	}
	for _, kind := range allKinds() {
		s.reads[kind] = map[string]snapshotRead{}
		names := []string{"service"}
		if kind != document.KindService {
			listed, err := src.List(ctx, kind)
			s.lists[kind] = snapshotList{names: append([]string(nil), listed...), err: err}
			if err != nil {
				continue
			}
			names = listed
		}
		for _, name := range names {
			if kind == document.KindPrompt {
				// Wait until process references are known before deciding
				// which prompt read the check needs.
				continue
			}
			doc, err := src.Read(ctx, kind, name)
			s.reads[kind][name] = snapshotRead{doc: cloneDocument(doc), err: err}
		}
	}
	named := func(kind document.Kind, name string) {
		if _, ok := s.reads[kind][name]; ok || name == "" {
			return
		}
		doc, err := src.Read(ctx, kind, name)
		s.reads[kind][name] = snapshotRead{doc: cloneDocument(doc), err: err}
		if list := s.lists[kind]; err == nil && list.err == nil && kind != document.KindPrompt {
			list.names = append(list.names, name)
			sort.Strings(list.names)
			s.lists[kind] = list
		}
	}
	for _, read := range s.reads[document.KindProcess] {
		if read.err != nil {
			continue
		}
		process, err := parseProcess(read.doc)
		named(document.KindVerify, process.VerifyName)
		if err == nil {
			for _, name := range process.Prompts() {
				named(document.KindPrompt, name)
			}
		}
		for _, name := range process.Skills {
			named(document.KindSkill, name)
		}
	}
	for _, name := range s.lists[document.KindPrompt].names {
		if _, referenced := s.reads[document.KindPrompt][name]; referenced {
			continue
		}
		doc, err := src.ReadListed(ctx, document.KindPrompt, name)
		s.listed[name] = snapshotRead{doc: cloneDocument(doc), err: err}
	}
	for _, read := range s.reads[document.KindAgent] {
		if read.err != nil {
			continue
		}
		agent, _ := parseAgent(read.doc)
		for _, name := range agent.skills {
			named(document.KindSkill, name)
		}
	}
	return s
}

func cloneDocument(doc document.Document) document.Document {
	doc.Bytes = append([]byte(nil), doc.Bytes...)
	if doc.Texts != nil {
		doc.Texts = append([]document.LayerText(nil), doc.Texts...)
		for i, text := range doc.Texts {
			doc.Texts[i].Bytes = append([]byte(nil), text.Bytes...)
			if text.File.Fields != nil {
				doc.Texts[i].File.Fields = append([]string{}, text.File.Fields...)
			}
		}
	}
	if doc.Source.Layers != nil {
		doc.Source.Layers = append([]document.LayerFile(nil), doc.Source.Layers...)
		for i, layer := range doc.Source.Layers {
			if layer.Fields != nil {
				doc.Source.Layers[i].Fields = append([]string{}, layer.Fields...)
			}
		}
	}
	return doc
}

func cloneLayers(layers []document.LayerDir) []document.LayerDir {
	if layers == nil {
		return nil
	}
	cloned := append([]document.LayerDir(nil), layers...)
	for i, layer := range cloned {
		cloned[i].Invalid = append([]document.LayerProblem(nil), layer.Invalid...)
	}
	return cloned
}

func (s *snapshot) Read(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	read, ok := s.reads[kind][name]
	if !ok {
		return document.Document{}, fmt.Errorf("not found in the settings snapshot")
	}
	return cloneDocument(read.doc), read.err
}

// ReadListed gives an unreferenced inventory prompt as the settings list
// it, and any other kind as Read does. Referenced prompts are frozen only
// as Read returns them, because that is what the check and call use.
func (s *snapshot) ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	if kind != document.KindPrompt {
		return s.Read(ctx, kind, name)
	}
	read, ok := s.listed[name]
	if !ok {
		return document.Document{}, fmt.Errorf("not found in the settings snapshot")
	}
	return cloneDocument(read.doc), read.err
}

func (s *snapshot) Layers(context.Context) []document.LayerDir { return cloneLayers(s.layers) }

func (s *snapshot) List(_ context.Context, kind document.Kind) ([]string, error) {
	list, ok := s.lists[kind]
	if !ok {
		return nil, nil
	}
	return append([]string(nil), list.names...), list.err
}
