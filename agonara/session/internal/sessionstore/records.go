package sessionstore

// The file adapter owns schema evolution independently of reading semantics.
type ReadingRecord struct {
	Current SessionRecord   `json:"current"`
	Resume  *BookmarkRecord `json:"resume,omitempty"`
}
type legacyBotRecord struct {
	Offset  int64         `json:"offset"`
	Session SessionRecord `json:"session"`
}
type PlaceRecord struct {
	Screen    string `json:"screen"`
	ProgramID string `json:"programId,omitempty"`
	EntityID  string `json:"entityId,omitempty"`
	Title     string `json:"title,omitempty"`
	Page      *int   `json:"page,omitempty"`
	Contents  bool   `json:"contents,omitempty"`
}
type ItemRecord struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
}
type SessionRecord struct {
	MaterialRevision string `json:"materialRevision,omitempty"`
	PlaceRecord
	PageCount *int          `json:"pageCount,omitempty"`
	Items     []ItemRecord  `json:"items"`
	History   []PlaceRecord `json:"history"`
	Step      int           `json:"step"`
}
type PositionRecord struct {
	Section      *int
	Label        string
	Index, Count int
}
type BookmarkRecord struct {
	ProgramID, EntityID, Title string
	Page                       int
	Position                   *PositionRecord
	Course                     *ItemRecord
	Courses                    []ItemRecord
}

// The version envelope is private to the file format.
type readingFileRecord struct {
	Version int `json:"version"`
	ReadingRecord
}

type TransportRecord struct {
	Offset   int64 `json:"offset"`
	Revision int   `json:"revision"`
}
