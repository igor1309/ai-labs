package definition_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// A repository's blocks name a process, workflow, agent or runtime mapping
// each, by the reference the settings use, with an optional reason
// (ADR-018 rule 1).
func TestBlocksParsing(t *testing.T) {
	t.Parallel()
	blocks, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", `
schema: agister.blocks/v1alpha1
blocks:
  - ref: agent:codex-implementer-sol-61
    reason: Codex does not implement in this repository
  - ref: process:implement_codex
  - {ref: "workflow:panel"}
  - {ref: "runtime:codex"}
`))
	want := []definition.Block{
		{Kind: document.KindAgent, Name: "codex-implementer-sol-61", Reason: "Codex does not implement in this repository"},
		{Kind: document.KindProcess, Name: "implement_codex"},
		{Kind: document.KindWorkflow, Name: "panel"},
		{Kind: document.KindRuntime, Name: "codex"},
	}
	if err != nil || !reflect.DeepEqual(blocks.Blocks, want) {
		t.Fatalf("blocks = %+v, %v", blocks.Blocks, err)
	}
	if ref := blocks.Blocks[3].Ref(); ref != "runtime:codex" {
		t.Fatalf("ref = %q", ref)
	}
	if blocks, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", "schema: agister.blocks/v1alpha1\nblocks: []\n")); err != nil || len(blocks.Blocks) != 0 {
		t.Fatalf("no blocks = %+v, %v", blocks, err)
	}
}

// Every problem of a blocks.yaml is reported: a kind that cannot be
// blocked, a reference that is not one, a name that is not a name, a block
// named twice, an unknown field, a reason that is empty.
func TestBlocksProblems(t *testing.T) {
	t.Parallel()
	_, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", `
schema: agister.blocks/v1alpha2
blocks:
  - ref: policy:read-only
  - ref: reviewer
  - ref: agent:Not A Name
  - ref: agent:reviewer
  - ref: agent:reviewer
  - {ref: "process:p", why: typo}
  - {ref: "process:q", reason: ""}
  - reason: no ref
`))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{
		`schema: must be "agister.blocks/v1alpha1"`,
		`blocks[0].ref: "policy" cannot be blocked: only a process, workflow, agent or runtime is`,
		`blocks[1].ref: must be "<kind>:<name>"`,
		`blocks[2].ref: invalid agent name "Not A Name"`,
		`blocks[4].ref: agent:reviewer is blocked twice (also blocks[3])`,
		`blocks[5].why: unknown field`,
		`blocks[6].reason: must not be empty`,
		`blocks[7].ref: is required`,
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in:\n%v", want, err)
		}
	}
	for _, text := range []string{"schema: agister.blocks/v1alpha1\n", "schema: agister.blocks/v1alpha1\nblocks: {ref: agent:a}\n"} {
		if _, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", text)); err == nil || !strings.Contains(err.Error(), "blocks: ") {
			t.Errorf("%q: %v", text, err)
		}
	}
}

// A key declared twice, in the blocks.yaml itself or in one of its
// entries, is a problem: neither entry silently wins over the other.
func TestBlocksRejectDuplicateKeys(t *testing.T) {
	t.Parallel()
	_, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", `
schema: agister.blocks/v1alpha1
blocks:
  - ref: agent:reviewer
blocks:
  - ref: process:p
    reason: first
    ref: process:q
`))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{
		"blocks: is declared more than once",
		"blocks[0].ref: is declared more than once",
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in:\n%v", want, err)
		}
	}
}

// A blocks.yaml holds exactly one document: a second, even after an empty
// first, is a problem, not a document left unread.
func TestBlocksRejectMoreThanOneDocument(t *testing.T) {
	t.Parallel()
	for _, text := range []string{
		"---\n---\nschema: agister.blocks/v1alpha1\nblocks:\n  - ref: agent:reviewer\n",
		"schema: agister.blocks/v1alpha1\nblocks: []\n---\nschema: agister.blocks/v1alpha1\nblocks:\n  - ref: agent:reviewer\n",
	} {
		blocks, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", text))
		if err == nil || !strings.Contains(err.Error(), "must hold exactly one YAML document") {
			t.Errorf("%q: %v", text, err)
		}
		if len(blocks.Blocks) != 0 {
			t.Errorf("%q: blocks = %+v", text, blocks.Blocks)
		}
	}
	for _, text := range []string{"", "# nothing\n"} {
		if _, err := definition.ParseBlocks(doc(document.KindBlocks, "blocks", text)); err == nil || !strings.Contains(err.Error(), "empty document") {
			t.Errorf("%q: %v", text, err)
		}
	}
}
