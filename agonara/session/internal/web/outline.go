package web

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Row is one topic or module of a program as the page lists it: the number
// its title carries as a short label ("Тема 3"), the rest as its name, and
// what it links to. A material listed by several rows lives in one: a topic
// before the module that also lists it.
type Row struct {
	ID        string
	Full      string // the title as Agonara has it
	Label     string // "Тема 3", or empty when the title carries no number
	Name      string // the title without its label
	Module    bool
	Concepts  int
	Materials []Material
	n         int
	at        int
}

// Material is a row's link to read. Title is empty when it repeats the row's
// own title, so the page prints that title once.
type Material struct {
	ID    string
	Title string
}

// Outline is a program laid out for the page: modules first, then topics,
// each by the number in its title.
type Outline struct {
	Modules, Topics []Row
	Rows            int // modules and topics together
	ConceptCount    int
	WithMaterials   int
}

var numbered = regexp.MustCompile(`^(Модуль|Тема)\s+(\d+)\.?\s*(.*)$`)

// split takes "Тема 3. Этические проблемы" apart into "Тема 3" and the name.
func split(title string) (label, name string, module bool, n int) {
	m := numbered.FindStringSubmatch(strings.TrimSpace(title))
	if m == nil {
		return "", title, false, 1 << 30
	}
	n, _ = strconv.Atoi(m[2])
	name = m[3]
	if name == "" {
		name = title
	}
	return m[1] + " " + m[2], name, m[1] == "Модуль", n
}

func newOutline(program *Program) Outline {
	var out Outline
	if program == nil {
		return out
	}
	rows := make([]Row, len(program.Courses))
	for i, c := range program.Courses {
		label, name, module, n := split(c.Topic.Title)
		rows[i] = Row{ID: c.Topic.ID, Full: c.Topic.Title, Label: label, Name: name, Module: module, Concepts: c.ConceptCount, n: n, at: i}
		out.ConceptCount += c.ConceptCount
	}
	// Topics claim their materials before modules do.
	claimed := map[string]bool{}
	for _, pass := range []bool{false, true} {
		for i, c := range program.Courses {
			if rows[i].Module != pass {
				continue
			}
			for _, m := range c.Materials {
				if claimed[m.ID] {
					continue
				}
				claimed[m.ID] = true
				title := m.Title
				if title == c.Topic.Title || title == rows[i].Name {
					title = ""
				}
				rows[i].Materials = append(rows[i].Materials, Material{ID: m.ID, Title: title})
			}
		}
	}
	// A module's lecture named "Тема 4. …" belongs to Тема 4 when no topic
	// lists it: move it there, where its title is the topic's own.
	byLabel := map[string]int{}
	for i, r := range rows {
		if !r.Module && r.Label != "" {
			byLabel[r.Label] = i
		}
	}
	for i := range rows {
		if !rows[i].Module {
			continue
		}
		kept := rows[i].Materials[:0]
		for _, m := range rows[i].Materials {
			label, name, _, _ := split(m.Title)
			if t, ok := byLabel[label]; ok && label != "" {
				title := ""
				if name != rows[t].Name {
					title = m.Title
				}
				rows[t].Materials = append(rows[t].Materials, Material{ID: m.ID, Title: title})
				continue
			}
			kept = append(kept, m)
		}
		rows[i].Materials = kept
	}
	out.WithMaterials = 0
	for _, r := range rows {
		if len(r.Materials) > 0 {
			out.WithMaterials++
		}
	}
	sort.SliceStable(rows, func(a, b int) bool {
		if rows[a].n != rows[b].n {
			return rows[a].n < rows[b].n
		}
		return rows[a].at < rows[b].at
	})
	for _, r := range rows {
		if r.Module {
			out.Modules = append(out.Modules, r)
		} else {
			out.Topics = append(out.Topics, r)
		}
	}
	out.Rows = len(rows)
	return out
}

// home is the row a material lives in.
func (o Outline) home(materialID string) *Row {
	for _, list := range [][]Row{o.Topics, o.Modules} {
		for i := range list {
			for _, m := range list[i].Materials {
				if m.ID == materialID {
					return &list[i]
				}
			}
		}
	}
	return nil
}
