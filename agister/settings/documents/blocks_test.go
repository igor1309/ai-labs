package documents_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const blocksFile = "/repo/.agister/blocks.yaml"

// blocksOf is the blocks documents gives of a snapshot whose blocks file
// holds bytes.
func blocksOf(bytes string) ([]documents.Field[documents.Block], []documents.Problem) {
	return documents.New(documents.Snapshot{Blocks: source(blocksFile, bytes)}).Blocks()
}

// block is the block of the document kind and name, for reason, on line of
// the blocks file.
func block(kind documents.Kind, name, reason string, line int) documents.Field[documents.Block] {
	return documents.Field[documents.Block]{Value: documents.Block{Kind: kind, Name: name, Reason: reason},
		Origin: documents.Origin{Path: blocksFile, Line: line}, Given: true}
}

func assertBlocks(t *testing.T, got, want []documents.Field[documents.Block]) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("blocks\n got %+v\nwant %+v", got, want)
	}
}

// inBlocks is a problem at place of the blocks file, on line.
func inBlocks(line int, place, message string) documents.Problem {
	return documents.Problem{Path: blocksFile, Line: line, Place: place, Message: message}
}

// blocks.feature, "Each block is a document by kind and name, with its
// reason": the feature's blocks, and one of every kind a block may name.
func TestEachBlockIsADocumentByKindAndName(t *testing.T) {
	t.Parallel()
	got, problems := blocksOf("- {process: review, reason: it writes to main}\n- {agent: codex, reason: no network here}\n")
	assertProblems(t, problems, nil)
	assertBlocks(t, got, []documents.Field[documents.Block]{
		block(documents.Process, "review", "it writes to main", 1),
		block(documents.Agent, "codex", "no network here", 2),
	})

	kinds := []documents.Kind{documents.Workflow, documents.Process, documents.Agent, documents.Runtime,
		documents.Brief, documents.Prompt, documents.Schema, "skill"}
	for _, kind := range kinds {
		t.Run(string(kind), func(t *testing.T) {
			t.Parallel()
			got, problems := blocksOf("- {" + string(kind) + ": a, reason: why}\n")
			assertProblems(t, problems, nil)
			assertBlocks(t, got, []documents.Field[documents.Block]{block(kind, "a", "why", 1)})
		})
	}
}

// blocks.feature, "No blocks file gives no blocks"; and an empty one gives
// none.
func TestNoBlocksFileGivesNoBlocks(t *testing.T) {
	t.Parallel()
	got, problems := documents.New(documents.Snapshot{}).Blocks()
	assertProblems(t, problems, nil)
	assertBlocks(t, got, nil)

	got, problems = blocksOf("")
	assertProblems(t, problems, nil)
	assertBlocks(t, got, nil)
}

// blocks.feature, "A block that is not a kind, a name and a reason is a
// problem": the feature's blocks, and a name or a reason that is no text,
// and a block that is no map; none gives a block, though the file holds a
// good one too.
func TestABlockThatIsNotAKindANameAndAReasonIsAProblem(t *testing.T) {
	t.Parallel()
	const one = "it names one kind and a name"
	cases := []struct {
		block string
		want  []documents.Problem
	}{
		{"{process: review}", []documents.Problem{inBlocks(2, "[1].reason", "it is missing")}},
		{"{reason: why}", []documents.Problem{inBlocks(2, "[1]", one)}},
		{"{process: a, agent: b, reason: why}", []documents.Problem{inBlocks(2, "[1]", one)}},
		{"{pages: a, reason: why}", []documents.Problem{inBlocks(2, "[1].pages", "the field is not known"), inBlocks(2, "[1]", one)}},
		{"{process: 1, reason: why}", []documents.Problem{inBlocks(2, "[1].process", "it is a string, not an integer")}},
		{"{process: a, reason: [why]}", []documents.Problem{inBlocks(2, "[1].reason", "it is a string, not a list")}},
		{"process", []documents.Problem{inBlocks(2, "[1]", "it is a map, not a string")}},
	}
	for _, c := range cases {
		t.Run(c.block, func(t *testing.T) {
			t.Parallel()
			got, problems := blocksOf("- {agent: codex, reason: no network here}\n- " + c.block + "\n")
			assertBlocks(t, got, nil)
			assertProblems(t, problems, c.want)
		})
	}
}

// blocks.feature, "A blocks file that is not a list is a problem"; and one
// whose bytes are not YAML has their problems.
func TestABlocksFileThatIsNotAListIsAProblem(t *testing.T) {
	t.Parallel()
	got, problems := blocksOf("process: review\n")
	assertBlocks(t, got, nil)
	assertProblems(t, problems, []documents.Problem{{Path: blocksFile, Message: "it is a list"}})

	const bad = "- [\n"
	got, problems = blocksOf(bad)
	assertBlocks(t, got, nil)
	assertProblems(t, problems, decodeProblems(t, tree.YAML, bad, blocksFile))
}

// The blocks given are the caller's own: changing them changes nothing
// the documents hold.
func TestTheBlocksGivenAreTheCallersOwn(t *testing.T) {
	t.Parallel()
	d := documents.New(documents.Snapshot{Blocks: source(blocksFile, "- {process: review, reason: why}\n")})
	gotten, _ := d.Blocks()
	gotten[0].Value.Name = "x"
	got, problems := d.Blocks()
	assertProblems(t, problems, nil)
	assertBlocks(t, got, []documents.Field[documents.Block]{block(documents.Process, "review", "why", 1)})
}
