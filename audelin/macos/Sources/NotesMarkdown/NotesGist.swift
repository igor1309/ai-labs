import Markdown

extension NotesMarkdown {
    /// What the call was about, in one line: the first sentence of the first
    /// paragraph under the notes' first heading (the notes open with what the
    /// call was about), as plain text. Nil when that paragraph is missing or empty.
    public static func gist(_ markdown: String) -> String? {
        let document = Document(parsing: markdown)
        var seenHeading = false
        for child in document.children {
            if child is Heading {
                if seenHeading { return nil }
                seenHeading = true
                continue
            }
            guard seenHeading, let paragraph = child as? Paragraph else { continue }
            return firstSentence(text(paragraph))
        }
        return nil
    }

    /// The words a reader sees: inline marks and code ticks dropped, line breaks as spaces.
    private static func text(_ markup: Markup) -> String {
        switch markup {
        case let plain as Markdown.Text: plain.string
        case let code as InlineCode: code.code
        case is SoftBreak, is LineBreak: " "
        default: markup.children.map(text).joined()
        }
    }

    private static func firstSentence(_ text: String) -> String? {
        let flat = text.split(whereSeparator: \.isNewline).joined(separator: " ").trimmingCharacters(in: .whitespaces)
        guard !flat.isEmpty else { return nil }
        var index = flat.startIndex
        while index < flat.endIndex {
            let next = flat.index(after: index)
            if ".!?…".contains(flat[index]), next == flat.endIndex || flat[next] == " " {
                return String(flat[..<next])
            }
            index = next
        }
        return flat
    }
}
