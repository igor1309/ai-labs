package flow

type CatalogEntry struct{ ID, Title, Description string }
type Navigation struct{ Topics, Concepts, Materials []Item }
type Entity struct {
	ID, ProgramID, Title, Body, Kind string
	Readable                         bool
	Parents, Children                []Item
}
