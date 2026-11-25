package folderindex

import (
	"slices"
	"strings"
)

func summary(readme string) string {
	readme = strings.ReplaceAll(strings.ReplaceAll(readme, "\r\n", "\n"), "\r", "\n")
	lines := strings.Split(strings.TrimPrefix(readme, "\ufeff"), "\n")
	var prose, fence string
	var inComment bool
	references := make(map[string]bool)
	for i, raw := range lines {
		line := strings.TrimSpace(raw)
		if inComment {
			inComment = !strings.Contains(line, "-->")
			continue
		}
		if fence != "" {
			if strings.HasPrefix(line, fence) && strings.Trim(line, fence[:1]) == "" {
				fence = ""
			}
			continue
		}
		if strings.HasPrefix(line, "```") || strings.HasPrefix(line, "~~~") {
			width := markerWidth(line)
			if line[0] == '~' || !strings.ContainsRune(line[width:], '`') {
				fence = line[:width]
				continue
			}
		}
		if strings.HasPrefix(line, "<!--") {
			inComment = !strings.Contains(line[4:], "-->")
			continue
		}
		if strings.HasPrefix(line, "[") {
			if end := closingDelimiter(line, 0, '[', ']'); end > 1 && strings.HasPrefix(line[end+1:], ":") {
				references[referenceKey(line[1:end])] = true
				continue
			}
		}
		if prose == "" && isProse(line) && (i+1 == len(lines) || !setextUnderline(strings.TrimSpace(lines[i+1]))) {
			prose = line
			if !strings.Contains(prose, "[") {
				break
			}
		}
	}

	prose = strings.TrimSpace(linkText(prose, references))
	if prose == "" {
		return "no summary"
	}
	const maxRunes = 160
	runes := []rune(prose)
	if len(runes) > maxRunes {
		return string(runes[:maxRunes-1]) + "…"
	}
	return prose
}

func isProse(line string) bool {
	if line == "" || setextUnderline(line) || strings.HasPrefix(line, "![") || strings.HasPrefix(line, "[![") {
		return false
	}
	text := strings.TrimLeft(line, "#")
	if count := len(line) - len(text); count > 0 && count <= 6 && (text == "" || text[0] == ' ' || text[0] == '\t') {
		return false
	}
	if strings.HasPrefix(line, "<") && strings.Contains(line, ">") {
		tag := strings.TrimPrefix(line[1:], "/")
		name := tag[:strings.IndexAny(tag, " \t/>")]
		if name != "" && !strings.ContainsAny(name, ":@") {
			first := name[0]
			return !(first == '!' || first == '?' || first >= 'A' && first <= 'Z' || first >= 'a' && first <= 'z')
		}
	}
	return true
}

func setextUnderline(line string) bool {
	return line != "" && (strings.Trim(line, "-") == "" || strings.Trim(line, "=") == "")
}

func referenceKey(label string) string {
	return strings.ToLower(strings.Join(strings.Fields(label), " "))
}

// linkText reduces Markdown links to their text. It matches every bracket,
// parenthesis and code span in one pass first, so each lookup is direct and
// the line is read a bounded number of times however its brackets fall.
func linkText(line string, references map[string]bool) string {
	m := scan(line)
	var out strings.Builder
	for i := 0; i < len(line); {
		switch line[i] {
		case '\\':
			if i+1 < len(line) {
				out.WriteString(line[i : i+2])
				i += 2
				continue
			}
		case '`':
			width := markerWidth(line[i:])
			end := i + width
			if closing := m.codeRun(width, end); closing != -1 {
				end = closing + width
			}
			out.WriteString(line[i:end])
			i = end
			continue
		case '[':
			if i == 0 || line[i-1] != '!' {
				if label, end := m.readLink(line, i, references); end != -1 {
					out.WriteString(label)
					i = end + 1
					continue
				}
			}
		}
		out.WriteByte(line[i])
		i++
	}
	return out.String()
}

// matches holds, for each opening bracket or parenthesis, where its closing
// one is, and for each width, where backtick runs of that width start.
type matches struct {
	closing map[int]int
	runs    map[int][]int
}

func scan(line string) matches {
	m := matches{closing: make(map[int]int), runs: make(map[int][]int)}
	var brackets, parens []int
	for i := 0; i < len(line); i++ {
		switch line[i] {
		case '\\':
			i++
		case '[':
			brackets = append(brackets, i)
		case ']':
			if n := len(brackets); n > 0 {
				m.closing[brackets[n-1]] = i
				brackets = brackets[:n-1]
			}
		case '(':
			parens = append(parens, i)
		case ')':
			if n := len(parens); n > 0 {
				m.closing[parens[n-1]] = i
				parens = parens[:n-1]
			}
		}
	}
	for i := 0; i < len(line); {
		if line[i] != '`' {
			i++
			continue
		}
		width := markerWidth(line[i:])
		m.runs[width] = append(m.runs[width], i)
		i += width
	}
	return m
}

func (m matches) close(open int) int {
	if end, ok := m.closing[open]; ok {
		return end
	}
	return -1
}

// codeRun gives the start of the first backtick run of width at or after
// from, or -1.
func (m matches) codeRun(width, from int) int {
	starts := m.runs[width]
	at, _ := slices.BinarySearch(starts, from)
	if at == len(starts) {
		return -1
	}
	return starts[at]
}

func markerWidth(text string) int {
	return len(text) - len(strings.TrimLeft(text, text[:1]))
}

func (m matches) readLink(line string, start int, references map[string]bool) (string, int) {
	end := m.close(start)
	if end == -1 {
		return "", -1
	}
	label := line[start+1 : end]
	if end+1 < len(line) {
		switch line[end+1] {
		case '(':
			if destination := m.close(end + 1); destination != -1 {
				return label, destination
			}
		case '[':
			if refEnd := m.close(end + 1); refEnd != -1 {
				ref := line[end+2 : refEnd]
				if ref == "" {
					ref = label
				}
				if references[referenceKey(ref)] {
					return label, refEnd
				}
			}
			return "", -1
		}
	}
	if references[referenceKey(label)] {
		return label, end
	}
	return "", -1
}

func closingDelimiter(line string, start int, open, close byte) int {
	depth := 1
	for i := start + 1; i < len(line); i++ {
		switch line[i] {
		case '\\':
			i++
		case open:
			depth++
		case close:
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}
