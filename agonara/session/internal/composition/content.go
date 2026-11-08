package composition

import (
	"context"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

type ContentSource interface {
	ListPrograms(context.Context) ([]agonara.Program, error)
	Navigation(context.Context, string) (agonara.Navigation, error)
	Entity(context.Context, string) (agonara.Entity, error)
	MaterialContent(context.Context, string) (string, error)
}
type Content struct{ Source ContentSource }

func (a Content) ListPrograms(ctx context.Context) ([]flow.CatalogEntry, error) {
	in, err := a.Source.ListPrograms(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]flow.CatalogEntry, len(in))
	for i, p := range in {
		out[i] = flow.CatalogEntry{ID: p.ProgramID, Title: p.Title, Description: p.Description}
	}
	return out, nil
}
func nodes(in []agonara.Node) []flow.Item {
	out := make([]flow.Item, len(in))
	for i, n := range in {
		out[i] = flow.Item{ID: n.EntityID, Title: n.Title, Kind: n.AcceptedKind}
	}
	return out
}
func (a Content) Navigation(ctx context.Context, id string) (flow.Navigation, error) {
	in, err := a.Source.Navigation(ctx, id)
	if err != nil {
		return flow.Navigation{}, err
	}
	return flow.Navigation{Topics: nodes(in.Topics), Concepts: nodes(in.UngroupedConcepts), Materials: nodes(in.UngroupedMaterials)}, nil
}
func (a Content) Entity(ctx context.Context, id string) (flow.Entity, error) {
	in, err := a.Source.Entity(ctx, id)
	if err != nil {
		return flow.Entity{}, err
	}
	out := flow.Entity{ID: in.EntityID, ProgramID: in.ProgramID, Title: in.Title, Body: in.Body, Kind: in.AcceptedKind, Readable: in.HasContent}
	for _, l := range in.Relationships.Incoming {
		out.Parents = append(out.Parents, flow.Item{ID: l.FromEntityID, Title: l.FromTitle, Kind: l.FromKind})
	}
	for _, l := range in.Relationships.Outgoing {
		out.Children = append(out.Children, flow.Item{ID: l.ToEntityID, Title: l.ToTitle, Kind: l.ToKind})
	}
	return out, nil
}
func (a Content) MaterialContent(ctx context.Context, id string) (string, error) {
	return a.Source.MaterialContent(ctx, id)
}
