package folderindex

import "strings"

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

func linkText(line string, references map[string]bool) string {
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
			if closing := codeSpanEnd(line[end:], width); closing != -1 {
				end += closing
			}
			out.WriteString(line[i:end])
			i = end
			continue
		case '[':
			if i == 0 || line[i-1] != '!' {
				if label, end := readLink(line, i, references); end != -1 {
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

func codeSpanEnd(text string, width int) int {
	for offset := 0; offset < len(text); {
		start := strings.IndexByte(text[offset:], '`')
		if start == -1 {
			break
		}
		start += offset
		run := markerWidth(text[start:])
		offset = start + run
		if run == width {
			return offset
		}
	}
	return -1
}

func markerWidth(text string) int {
	return len(text) - len(strings.TrimLeft(text, text[:1]))
}

func readLink(line string, start int, references map[string]bool) (string, int) {
	end := closingDelimiter(line, start, '[', ']')
	if end == -1 {
		return "", -1
	}
	label := line[start+1 : end]
	if end+1 < len(line) {
		switch line[end+1] {
		case '(':
			if destination := closingDelimiter(line, end+1, '(', ')'); destination != -1 {
				return label, destination
			}
		case '[':
			if refEnd := closingDelimiter(line, end+1, '[', ']'); refEnd != -1 {
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
